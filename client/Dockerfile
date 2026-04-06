# 阶段 1: 构建阶段
FROM node:20-alpine AS build-stage

WORKDIR /app

# 拷贝依赖配置
COPY package*.json ./
RUN npm install

# 拷贝项目文件并打包
COPY . .
RUN npm run build

# 阶段 2: 运行阶段 (Nginx)
FROM nginx:alpine

# 拷贝构建后的静态文件到 Nginx
COPY --from=build-stage /app/dist /usr/share/nginx/html

# 拷贝 Nginx 配置文件 (稍后会创建)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
