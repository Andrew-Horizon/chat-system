/**
 * E2EE 端到端加密工具 (Web Crypto API)
 * 采用 RSA-OAEP + AES-256-GCM 混合加密
 */

const RSA_ALGORITHM = {
  name: 'RSA-OAEP',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256'
};

const AES_ALGORITHM = 'AES-GCM';
const AES_KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM

// ==================== 密钥对管理 ====================

/** 生成 RSA 密钥对 */
export const generateKeyPair = async () => {
  const keyPair = await crypto.subtle.generateKey(
    RSA_ALGORITHM,
    true, // extractable
    ['encrypt', 'decrypt']
  );
  return keyPair;
};

/** 将公钥导出为 JWK 格式（用于上传服务器） */
export const exportPublicKey = async (publicKey) => {
  const jwk = await crypto.subtle.exportKey('jwk', publicKey);
  return JSON.stringify(jwk);
};

/** 将私钥导出为 JWK 格式（用于存入 localStorage） */
export const exportPrivateKey = async (privateKey) => {
  const jwk = await crypto.subtle.exportKey('jwk', privateKey);
  return JSON.stringify(jwk);
};

/** 从 JWK 字符串导入公钥 */
export const importPublicKey = async (jwkString) => {
  const jwk = typeof jwkString === 'string' ? JSON.parse(jwkString) : jwkString;
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    RSA_ALGORITHM,
    true,
    ['encrypt']
  );
};

/** 从 JWK 字符串导入私钥 */
export const importPrivateKey = async (jwkString) => {
  const jwk = typeof jwkString === 'string' ? JSON.parse(jwkString) : jwkString;
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    RSA_ALGORITHM,
    true,
    ['decrypt']
  );
};

// ==================== 本地密钥存储 ====================

const PRIVATE_KEY_STORAGE = 'e2ee_private_key';
const PUBLIC_KEY_STORAGE = 'e2ee_public_key';

/** 将密钥对保存到 localStorage */
export const saveKeysToStorage = async (keyPair) => {
  const pubJwk = await exportPublicKey(keyPair.publicKey);
  const privJwk = await exportPrivateKey(keyPair.privateKey);
  localStorage.setItem(PUBLIC_KEY_STORAGE, pubJwk);
  localStorage.setItem(PRIVATE_KEY_STORAGE, privJwk);
  return { publicKeyJwk: pubJwk, privateKeyJwk: privJwk };
};

/** 从 localStorage 恢复私钥 */
export const getPrivateKeyFromStorage = async () => {
  const privJwk = localStorage.getItem(PRIVATE_KEY_STORAGE);
  if (!privJwk) return null;
  return await importPrivateKey(privJwk);
};

/** 从 localStorage 获取公钥 JWK 字符串 */
export const getPublicKeyJwkFromStorage = () => {
  return localStorage.getItem(PUBLIC_KEY_STORAGE);
};

/** 检查本地是否已有密钥对 */
export const hasLocalKeys = () => {
  return !!(localStorage.getItem(PRIVATE_KEY_STORAGE) && localStorage.getItem(PUBLIC_KEY_STORAGE));
};

// ==================== 加密 ====================

/** 
 * 加密消息
 * @param {string} plaintext - 明文
 * @param {Array<{userId: string, publicKey: CryptoKey}>} recipients - 接收者列表
 * @returns {{ ciphertext, iv, encryptedKeys }}
 */
export const encryptMessage = async (plaintext, recipients) => {
  // 1. 生成随机 AES 密钥
  const aesKey = await crypto.subtle.generateKey(
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );

  // 2. 生成随机 IV
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // 3. 用 AES 密钥加密明文
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: AES_ALGORITHM, iv },
    aesKey,
    plaintextBytes
  );

  // 4. 导出 AES 密钥的原始字节
  const rawAesKey = await crypto.subtle.exportKey('raw', aesKey);

  // 5. 用每个接收者的 RSA 公钥加密 AES 密钥
  const encryptedKeys = {};
  for (const recipient of recipients) {
    const encryptedAesKey = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      recipient.publicKey,
      rawAesKey
    );
    encryptedKeys[recipient.userId] = arrayBufferToBase64(encryptedAesKey);
  }

  return {
    ciphertext: arrayBufferToBase64(ciphertextBuffer),
    iv: arrayBufferToBase64(iv),
    encryptedKeys
  };
};

// ==================== 解密 ====================

/**
 * 解密消息
 * @param {string} ciphertextB64 - Base64 密文
 * @param {string} ivB64 - Base64 IV
 * @param {string} encryptedAesKeyB64 - Base64 加密的 AES 密钥
 * @param {CryptoKey} privateKey - 自己的 RSA 私钥
 * @returns {string} 明文
 */
export const decryptMessage = async (ciphertextB64, ivB64, encryptedAesKeyB64, privateKey) => {
  // 1. 用私钥解密 AES 密钥
  const encryptedAesKeyBuffer = base64ToArrayBuffer(encryptedAesKeyB64);
  const rawAesKey = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    encryptedAesKeyBuffer
  );

  // 2. 导入 AES 密钥
  const aesKey = await crypto.subtle.importKey(
    'raw',
    rawAesKey,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    false,
    ['decrypt']
  );

  // 3. 解密密文
  const ciphertextBuffer = base64ToArrayBuffer(ciphertextB64);
  const iv = base64ToArrayBuffer(ivB64);
  const plaintextBuffer = await crypto.subtle.decrypt(
    { name: AES_ALGORITHM, iv: new Uint8Array(iv) },
    aesKey,
    ciphertextBuffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(plaintextBuffer);
};

// ==================== 工具函数 ====================

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
