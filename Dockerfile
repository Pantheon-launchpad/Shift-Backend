# Use the official Bun image
FROM jarredsumner/bun:latest

# Set working directory inside the container
WORKDIR /app

# Copy package files first for dependency caching
COPY package.json bun.lockb ./

# Install dependencies
RUN bun install

# Copy the rest of your source code
COPY . .

# Expose the port your app will run on (change if your app uses another port)
EXPOSE 3000

# Command to start your app
CMD ["bun", "run", "start"]