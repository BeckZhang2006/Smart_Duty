import Toast from '@vant/weapp/toast/toast';

const app = getApp();

Page({
  data: {
    userInfo: {
      avatarUrl: '',
      realName: '',
      department: '',
      phone: ''
    },
    loading: false
  },

  onLoad() {
    this.loadUserInfo();
  },

  loadUserInfo() {
    const userInfo = app.globalData.userInfo || {};
    this.setData({
      userInfo: {
        avatarUrl: userInfo.avatarUrl || '',
        realName: userInfo.realName || '',
        department: userInfo.department || '',
        phone: userInfo.phone || ''
      }
    });
  },

  chooseAvatar() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempFilePath = res.tempFilePaths[0];
        
        // 检查文件大小（限制5MB）
        const maxSize = 5 * 1024 * 1024;
        if (res.tempFiles && res.tempFiles[0] && res.tempFiles[0].size > maxSize) {
          Toast('图片大小不能超过5MB');
          return;
        }
        
        Toast.loading({ message: '上传中...', forbidClick: true });
        
        try {
          // 上传图片到云存储
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath: `avatars/${Date.now()}-${Math.random().toString(36).substr(2)}.jpg`,
            filePath: tempFilePath
          });
          
          // 获取图片URL
          const fileRes = await wx.cloud.getTempFileURL({
            fileList: [uploadRes.fileID]
          });
          
          this.setData({
            'userInfo.avatarUrl': fileRes.fileList[0].tempFileURL
          });
          
          Toast.clear();
        } catch (err) {
          Toast.clear();
          Toast.fail('上传失败');
        }
      }
    });
  },

  onRealNameChange(e) {
    this.setData({ 'userInfo.realName': e.detail });
  },

  onDepartmentChange(e) {
    this.setData({ 'userInfo.department': e.detail });
  },

  onPhoneChange(e) {
    this.setData({ 'userInfo.phone': e.detail });
  },

  async saveProfile() {
    const { userInfo } = this.data;
    
    if (!userInfo.realName.trim()) {
      Toast.fail('请输入真实姓名');
      return;
    }
    
    this.setData({ loading: true });
    Toast.loading({ message: '保存中...', forbidClick: true });
    
    try {
      const db = wx.cloud.database();
      const currentUser = app.globalData.userInfo;
      
      await db.collection('users').doc(currentUser._id).update({
        data: {
          avatarUrl: userInfo.avatarUrl,
          realName: userInfo.realName,
          department: userInfo.department,
          phone: userInfo.phone,
          updateTime: db.serverDate()
        }
      });
      
      // 更新全局数据
      app.globalData.userInfo = {
        ...currentUser,
        ...userInfo
      };
      
      Toast.clear();
      Toast.success('保存成功');
      
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (err) {
      Toast.clear();
      Toast.fail('保存失败');
    } finally {
      this.setData({ loading: false });
    }
  }
});
