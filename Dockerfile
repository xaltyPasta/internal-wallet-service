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

# Generate Prisma client
RUN npx prisma generate

# Expose application port
EXPOSE 3000

# Start application
CMD ["npm", "run", "dev"]
