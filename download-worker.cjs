// download-worker.cjs
// 下载工作线程，负责单个块的下载
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * 下载文件块
 * @param {string} url - 下载地址
 * @param {string} dest - 目标文件路径
 * @param {number} start - 开始位置
 * @param {number} end - 结束位置
 * @param {Function} onProgress - 进度回调
 */
async function downloadChunk(url, dest, start, end, onProgress) {
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      headers: {
        Range: `bytes=${start}-${end}`
      },
      timeout: 30000
    });

    const chunkSize = end - start + 1;
    let downloaded = 0;
    const hash = crypto.createHash('sha1');
    const writeStream = fs.createWriteStream(dest);

    return new Promise((resolve, reject) => {
      response.data.on('data', chunk => {
        hash.update(chunk);
        downloaded += chunk.length;
        onProgress?.(downloaded, chunkSize);
      });

      writeStream.on('finish', () => {
        resolve(hash.digest('hex'));
      });

      writeStream.on('error', reject);
      response.data.on('error', reject);
      response.data.pipe(writeStream);
    });
  } catch (error) {
    throw new Error(`chunk下载失败: ${error.message}`);
  }
}

module.exports = {
  downloadChunk
};
