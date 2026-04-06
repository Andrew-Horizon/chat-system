# 使用轻量级的 Node.js 20 镜像
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 先拷贝 package.json 并安装依赖，利用 Docker 层缓存
COPY package*.json ./
RUN npm install --production

# 拷贝源代码
COPY . .

# 暴露后端端口
EXPOSE 3000

# 启动服务
CMD ["npm", "start"]
