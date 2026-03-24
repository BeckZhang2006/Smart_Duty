import Toast from '@vant/weapp/toast/toast';

const app = getApp();

Page({
  data: {
    isRegistering: false,
    canIUseGetUserProfile: false,
    userInfo: null,
    form: {
      realName: '',
      phone: '',
      department: ''
    }
  },

  onLoad() {
    // 检查是否支持 getUserProfile
    if (wx.getUserProfile) {
      this.setData({ canIUseGetUserProfile: true });
    }
    
    // 检查是否已登录
    this.checkLoginStatus();
  },

  // 检查登录状态
  async checkLoginStatus() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getUserInfo' });
      if (res.result.code === 0 && res.result.isRegistered) {
        // 已注册，跳转到首页
        app.globalData.userInfo = res.result.userInfo;
        app.globalData.isAdmin = res.result.isAdmin;
        app.globalData.openid = res.result.openid;
        
        wx.switchTab({ url: '/pages/index/index' });
      }
    } catch (err) {
      console.error('检查登录状态失败:', err);
    }
  },

  // 获取微信用户信息（新接口）
  getUserProfile() {
    wx.getUserProfile({
      desc: '用于完善用户资料',
      success: (res) => {
        this.setData({
          userInfo: res.userInfo,
          isRegistering: true
        });
      },
      fail: (err) => {
        console.error('获取用户信息失败:', err);
        Toast('需要授权才能继续使用');
      }
    });
  },

  // 获取微信用户信息（旧接口兼容）
  getUserInfo(e) {
    if (e.detail.userInfo) {
      this.setData({
        userInfo: e.detail.userInfo,
        isRegistering: true
      });
    } else {
      Toast('需要授权才能继续使用');
    }
  },

  // 表单输入
  onRealNameChange(e) {
    this.setData({ 'form.realName': e.detail });
  },

  onPhoneChange(e) {
    this.setData({ 'form.phone': e.detail });
  },

  onDepartmentChange(e) {
    this.setData({ 'form.department': e.detail });
  },

  // 提交注册
  async submitRegister() {
    const { form, userInfo } = this.data;
    
    // 表单验证
    if (!form.realName || !form.realName.trim()) {
      Toast('请输入真实姓名');
      return;
    }
    if (!form.phone || !form.phone.trim()) {
      Toast('请输入手机号');
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(form.phone)) {
      Toast('请输入正确的手机号');
      return;
    }

    wx.showLoading({ title: '注册中...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'registerUser',
        data: {
          realName: form.realName,
          phone: form.phone,
          department: form.department,
          avatarUrl: userInfo.avatarUrl,
          nickName: userInfo.nickName
        }
      });

      if (res.result.code === 0) {
        Toast.success('注册成功');
        
        // 更新全局数据
        app.globalData.userInfo = res.result.data;
        app.globalData.isAdmin = res.result.data.role === 'admin';
        
        // 跳转到首页
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' });
        }, 1500);
      } else {
        Toast(res.result.message || '注册失败');
      }
    } catch (err) {
      console.error('注册失败:', err);
      Toast('注册失败，请重试');
    } finally {
      wx.hideLoading();
    }
  },

  // 返回登录
  backToLogin() {
    this.setData({
      isRegistering: false,
      userInfo: null,
      form: { realName: '', phone: '', department: '' }
    });
  }
});
