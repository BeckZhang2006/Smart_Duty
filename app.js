import Toast from '@vant/weapp/toast/toast';

App({
  globalData: {
    userInfo: null,
    isAdmin: false,
    openid: null,
    location: null
  },

  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      try {
        wx.cloud.init({
          env: 'cloud1-9gi0qqksab0f13c9', // 替换为你的云开发环境ID
          traceUser: true
        });
        console.log('云开发初始化成功');
      } catch (err) {
        console.error('云开发初始化失败:', err);
      }
    }
    
    // 获取用户openid和权限信息（不阻塞启动）
    this.getUserInfo().catch(() => {
      // 静默处理错误
    });
  },

  // 获取用户信息
  getUserInfo: function() {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'getUserInfo'
      }).then(res => {
        const { openid, userInfo, isAdmin, isRegistered } = res.result;
        this.globalData.openid = openid;
        this.globalData.userInfo = userInfo;
        this.globalData.isAdmin = isAdmin;
        this.globalData.isRegistered = isRegistered;
        
        // 通知页面用户信息已更新
        if (this.userInfoReadyCallback) {
          this.userInfoReadyCallback(res.result);
        }
        
        resolve(res.result);
      }).catch(err => {
        console.error('获取用户信息失败:', err);
        reject(err);
      });
    });
  },

  // 检查登录状态，未登录跳转到登录页
  checkLoginStatus: function() {
    return new Promise((resolve) => {
      if (this.globalData.userInfo) {
        resolve(true);
      } else {
        this.getUserInfo().then(res => {
          if (res.isRegistered) {
            resolve(true);
          } else {
            // 未注册，跳转到登录页
            wx.redirectTo({ url: '/pages/login/login' });
            resolve(false);
          }
        }).catch(() => {
          // 获取失败，跳转到登录页
          wx.redirectTo({ url: '/pages/login/login' });
          resolve(false);
        });
      }
    });
  },

  // 检查权限
  checkPermission: function(requiredAdmin = false) {
    if (!this.globalData.userInfo) {
      Toast('请先登录');
      return false;
    }
    if (requiredAdmin && !this.globalData.isAdmin) {
      Toast('您没有权限执行此操作');
      return false;
    }
    return true;
  },

  // 获取当前位置
  getCurrentLocation: function() {
    return new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'gcj02',
        success: (res) => {
          this.globalData.location = {
            latitude: res.latitude,
            longitude: res.longitude
          };
          resolve(this.globalData.location);
        },
        fail: reject
      });
    });
  },

  // 计算两点距离（米）
  calculateDistance: function(lat1, lng1, lat2, lng2) {
    const radLat1 = lat1 * Math.PI / 180.0;
    const radLat2 = lat2 * Math.PI / 180.0;
    const a = radLat1 - radLat2;
    const b = lng1 * Math.PI / 180.0 - lng2 * Math.PI / 180.0;
    let s = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin(a / 2), 2) +
      Math.cos(radLat1) * Math.cos(radLat2) * Math.pow(Math.sin(b / 2), 2)));
    s = s * 6378.137; // EARTH_RADIUS
    s = Math.round(s * 10000) / 10; // 转换为米
    return s;
  },

  // 格式化日期
  formatDate: function(date, format = 'YYYY-MM-DD') {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');
    
    return format
      .replace('YYYY', year)
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hour)
      .replace('mm', minute);
  },

  // 检查班次是否跨天
  isOvernightShift: function(startTime, endTime) {
    const start = new Date(`2000-01-01 ${startTime}`);
    const end = new Date(`2000-01-01 ${endTime}`);
    return end <= start;
  },

  // 获取本地日期字符串（解决时区问题）
  getLocalDateString: function(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 获取本地月份字符串
  getLocalMonthString: function(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }
});
