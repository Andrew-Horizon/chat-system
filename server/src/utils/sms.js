const Dypnsapi = require('@alicloud/dypnsapi20170525');
const Client = Dypnsapi.default;
const OpenApi = require('@alicloud/openapi-client');
const Util = require('@alicloud/tea-util');

let clientInstance = null;

/**
 * 创建并获取阿里云客户端 (懒加载保证环境变量已读取)
 */
function getClient() {
  if (clientInstance) return clientInstance;

  const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID || process.env.ALIBABA_CLOUD_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET || process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET;

  if (!accessKeyId || !accessKeySecret) {
    console.warn('⚠️ 阿里云配置缺失，短信服务将会报错，请在 .env 中配置 ALIYUN_ACCESS_KEY_ID 和 ALIYUN_ACCESS_KEY_SECRET');
  }

  const config = new OpenApi.Config({
    accessKeyId,
    accessKeySecret,
  });
  
  // 号码认证服务 (短信认证) 的专属域名
  config.endpoint = 'dypnsapi.aliyuncs.com';
  clientInstance = new Client(config);
  return clientInstance;
}

/**
 * 发送短信验证码
 * @param {string} phone 手机号
 * @param {string} code 验证码
 * @returns {Promise<boolean>}
 */
async function sendSmsCode(phone, code) {
  const signName = process.env.ALIYUN_SMS_SIGN_NAME;
  const templateCode = process.env.ALIYUN_SMS_TEMPLATE_CODE;

  if (!signName || !templateCode) {
    console.error('发送短信失败: 缺少 ALIYUN_SMS_SIGN_NAME 或 ALIYUN_SMS_TEMPLATE_CODE 环境变量');
    return false;
  }

  // 根据您的截图，模板中含有 ${code} 和 ${min} 两个变量，这里固定传 min 为 5
  const templateParam = {
    code: code,
    min: "5"
  };

  const sendSmsRequest = new Dypnsapi.SendSmsVerifyCodeRequest({
    phoneNumber: phone,
    signName: signName,
    templateCode: templateCode,
    templateParam: JSON.stringify(templateParam),
  });

  const runtime = new Util.RuntimeOptions({
    readTimeout: 10000,
    connectTimeout: 10000
  });
  
  try {
    const response = await getClient().sendSmsVerifyCodeWithOptions(sendSmsRequest, runtime);
    if (response.body && response.body.code === 'OK') {
      console.log(`向 ${phone} 发送验证码成功: ${code}`);
      return true;
    } else {
      console.error(`向 ${phone} 发送验证码失败: ${response.body.message || response.body.code}`);
      return false;
    }
  } catch (error) {
    console.error(`调用阿里云号码认证(短信)接口异常:`, error.message);
    return false;
  }
}

module.exports = {
  sendSmsCode
};
