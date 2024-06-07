
# YouTube Clone

This repository hosts the source code for a YouTube clone. The core component of this project is the `video-processing-service`, which handles video file processing.

## Project Structure

- **video-processing-service**: A Node.js application utilizing Express.js for HTTP request handling and Fluent FFmpeg for video processing tasks.

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

What things you need to install the software and how to install them:

```sh
node --version
npm --version
ffmpeg -version  # Fluent FFmpeg requires FFmpeg to be installed
```

### Installation

1. **Clone the repository**:
   ```sh
   git clone https://github.com/Reddimus/youtube-clone.git
   ```

2. **Navigate to the service directory**:
   ```sh
   cd youtube-clone/video-processing-service
   ```

3. **Install dependencies**:
   ```sh
   npm install
   ```

### Running the Service

- **Start the server**:
  ```sh
  npm start
  ```

  This will start the service on `localhost:3000` by default. You can modify the `PORT` environment variable in your configuration file or directly in your terminal to use a different port.

## API Reference

The service exposes the following endpoint for video processing:

- **POST /process-video**:
  - **Purpose**: Processes a video file.
  - **Request Body**:
    ```json
    {
      "inputFilePath": "path/to/input.mp4",
      "outputFilePath": "path/to/output.mp4"
    }
    ```
  - **Response**: A status message indicating the success or failure of the video processing.
