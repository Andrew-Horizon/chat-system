# 阶段 1: 构建阶段
FROM node:20-alpine AS build-stage

WORKDIR /app

# 设置构建时的内存限制，防止在 2G 服务器上溢出
ENV NODE_OPTIONS="--max-old-space-size=1024"

# 拷贝依赖配置并安装
COPY package*.json ./
RUN npm install

# 拷贝项目文件并打包
COPY . .
RUN npm run build

# 阶段 2: 生产阶段 (使用 Nginx)
FROM nginx:stable-alpine

# 从构建阶段拷贝编译好的文件到 Nginx 目录
COPY --from=build-stage /app/dist /usr/share/nginx/html

# 拷贝 Nginx 配置文件
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
