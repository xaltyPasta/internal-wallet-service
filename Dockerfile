# Use lightweight Node image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files first (for layer caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy full project
COPY . .

# Expose application port
EXPOSE 3000

# Start application (generate Prisma client at runtime)
CMD ["sh", "-c", "npx prisma generate && npm run dev"]