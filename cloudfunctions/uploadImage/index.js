const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 上传图片到云存储
 * @param {String} fileContent 图片base64或buffer
 * @param {String} fileType 文件类型
 */
exports.main = async (event, context) => {
  const { fileContent, fileType = 'jpg', folder = 'checkin' } = event;
  const { OPENID } = cloud.getWXContext();
  
  try {
    // 生成文件名
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    const cloudPath = `${folder}/${OPENID}_${timestamp}_${random}.${fileType}`;
    
    // 上传到云存储
    const result = await cloud.uploadFile({
      cloudPath,
      fileContent: Buffer.from(fileContent, 'base64')
    });
    
    return {
      code: 0,
      data: {
        fileID: result.fileID,
        url: result.fileID // 云文件ID可以直接作为临时链接使用
      }
    };
    
  } catch (err) {
    console.error('上传失败:', err);
    return {
      code: -1,
      message: err.message
    };
  }
};
