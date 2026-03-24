import Toast from '@vant/weapp/toast/toast';

const app = getApp();

Page({
  data: {
    assignmentId: '',
    type: 'checkin', // checkin 或 checkout
    assignment: null,
    location: null,
    distance: null,
    fileList: [],
    remark: '',
    canCheckIn: false,
    canCheckOut: false,
    isSubmitting: false,
    currentTime: '',
    checkRecords: [],
    timer: null
  },

  onLoad(options) {
    // 检查登录状态
    app.checkLoginStatus().then(isLoggedIn => {
      if (!isLoggedIn) return;
      
      this.setData({
        assignmentId: options.id || '',
        type: options.type || 'checkin'
      });
      
      this.loadAssignment();
      this.updateTime();
      const timer = setInterval(() => this.updateTime(), 1000);
      this.setData({ timer });
    });
  },

  onUnload() {
    // 清理定时器，防止内存泄漏
    if (this.data.timer) {
      clearInterval(this.data.timer);
    }
  },

  onShow() {
    this.getLocation();
  },

  // 更新时间
  updateTime() {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    this.setData({ currentTime: time });
  },

  // 加载排班信息
  async loadAssignment() {
    wx.showLoading({ title: '加载中' });
    
    try {
      // 获取今天及未来几天的排班，以防跨天班次
      const today = app.getLocalDateString();
      const res = await wx.cloud.callFunction({
        name: 'getAssignments',
        data: {
          startDate: today,
          endDate: today
        }
      });
      
      if (res.result.code === 0) {
        console.log('loadAssignment: assignmentId =', this.data.assignmentId);
        console.log('loadAssignment: data =', res.result.data);
        
        let assignment = null;
        if (this.data.assignmentId) {
          assignment = res.result.data.find(a => a._id === this.data.assignmentId);
        } else {
          // 如果没有指定ID，取第一个待打卡或已签到的排班
          assignment = res.result.data.find(a => 
            a.status === 'pending' || a.status === 'checked_in'
          );
          if (assignment) {
            this.setData({ assignmentId: assignment._id });
          }
        }
        
        if (assignment) {
          console.log('loadAssignment: found assignment', assignment);
          this.setData({ assignment });
          this.generateRecords(assignment);
        } else {
          // 无排班时，加载今日打卡记录（如果有）
          this.loadTodayCheckRecord();
        }
        
        // 无论是否有排班，都计算距离和检查提交条件
        // 无排班时也可以正常打卡
        this.calculateDistance();
        this.checkCanSubmit();
      } else {
        Toast('加载排班失败');
      }
    } catch (err) {
      console.error('加载排班失败:', err);
      Toast('加载排班失败');
    } finally {
      wx.hideLoading();
    }
  },

  // 生成打卡记录显示（支持多条记录）
  generateRecords(recordsList) {
    const records = [];
    
    // 遍历所有记录，生成显示数据
    recordsList.forEach(item => {
      if (item.checkInTime) {
        records.push({
          text: `签到 ${this.formatTime(item.checkInTime)}`,
          desc: item.isLate ? '迟到' : '正常'
        });
      }
      
      if (item.checkOutTime) {
        records.push({
          text: `签退 ${this.formatTime(item.checkOutTime)}`,
          desc: `工时${item.workHours || 0}小时${item.isEarlyLeave ? '，早退' : ''}`
        });
      }
    });
    
    this.setData({ checkRecords: records });
  },

  // 加载今日打卡记录
  async loadTodayCheckRecord() {
    try {
      const today = app.getLocalDateString();
      
      // 使用云函数查询今日打卡记录
      const res = await wx.cloud.callFunction({
        name: 'getAllCheckRecords',
        data: {
          startDate: today,
          endDate: today
        }
      });
      
      if (res.result.code !== 0) {
        console.log('加载今日打卡记录失败:', res.result.message);
        return;
      }
      
      const records = res.result.data || [];
      
      // 只显示自由打卡记录
      const freeRecords = records.filter(r => r.recordType === 'free');
      
      if (freeRecords.length > 0) {
        // 显示所有记录
        this.generateRecords(freeRecords);
        
        // 判断是否需要切换到签退模式
        // 找到最新的一条记录
        const latestRecord = freeRecords[0]; // 已按时间倒序
        
        if (latestRecord.status === 'checked_in') {
          // 最新记录已签到但未签退，切换到签退模式
          this.setData({ type: 'checkout' });
          this.checkCanSubmit();
        } else if (latestRecord.status === 'checked_out') {
          // 最新记录已签退，切换回签到模式，允许重新打卡
          this.setData({ type: 'checkin' });
          this.checkCanSubmit();
        }
      } else {
        // 没有记录时，确保显示签到按钮
        this.setData({ type: 'checkin' });
        this.checkCanSubmit();
      }
    } catch (err) {
      console.log('加载今日打卡记录失败:', err);
    }
  },

  // 获取位置
  getLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        console.log('getLocation success:', res);
        const location = {
          latitude: res.latitude,
          longitude: res.longitude,
          accuracy: Math.round(res.accuracy)
        };
        
        this.setData({ location }, () => {
          // 在setData回调中执行，确保location已更新
          this.calculateDistance();
          this.checkCanSubmit();
        });
      },
      fail: (err) => {
        console.error('定位失败:', err);
        Toast('定位失败，请检查权限设置');
        // 定位失败也尝试检查，可能允许无位置打卡（测试用）
        this.checkCanSubmit();
      }
    });
  },

  // 刷新位置
  refreshLocation() {
    this.setData({ location: null });
    this.getLocation();
  },

  // 计算距离
  calculateDistance() {
    const { location } = this.data;
    
    if (!location) {
      console.log('calculateDistance: location is null');
      return;
    }
    
    // 使用固定参考坐标（你提供的坐标）
    // 纬度: 36.67787272135417, 经度: 116.97408718532986
    const referenceLocation = {
      latitude: 36.67787272135417,
      longitude: 116.97408718532986
    };
    
    const distance = app.calculateDistance(
      location.latitude,
      location.longitude,
      referenceLocation.latitude,
      referenceLocation.longitude
    );
    
    console.log('calculateDistance:', distance, '米');
    // 保留1位小数
    this.setData({ distance: parseFloat(distance.toFixed(1)) });
  },

  // 检查是否可以提交
  checkCanSubmit() {
    const { location, distance, fileList, type } = this.data;
    
    console.log('checkCanSubmit:', { 
      hasLocation: !!location, 
      distance, 
      fileCount: fileList.length,
      type 
    });
    
    // 固定打卡范围500米
    const maxRadius = 500;
    
    if (type === 'checkin') {
      const canCheckIn = location && 
                        distance !== null && 
                        distance <= maxRadius &&
                        fileList.length > 0;
      
      console.log('checkCanSubmit: canCheckIn =', canCheckIn, {
        hasLocation: !!location,
        hasDistance: distance !== null,
        inRange: distance !== null && distance <= maxRadius,
        hasPhoto: fileList.length > 0
      });
      
      this.setData({ canCheckIn });
    } else {
      const canCheckOut = location && 
                         distance !== null && 
                         distance <= maxRadius;
      this.setData({ canCheckOut });
    }
  },

  // 照片上传后
  afterRead(event) {
    const { file } = event.detail;
    
    // 检查文件大小（限制10MB）
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      Toast('图片大小不能超过10MB');
      return;
    }
    
    this.setData({
      fileList: [{ url: file.url, name: 'photo.jpg', isImage: true }]
    });
    this.checkCanSubmit();
  },

  // 删除照片
  deletePhoto() {
    this.setData({ fileList: [] });
    this.checkCanSubmit();
  },

  // 备注变化
  onRemarkChange(e) {
    this.setData({ remark: e.detail });
  },

  // 签到
  async handleCheckIn() {
    if (!this.data.canCheckIn) return;
    
    this.setData({ isSubmitting: true });
    Toast.loading({ message: '打卡中...', forbidClick: true, duration: 0 });
    
    try {
      // 上传图片
      let photoUrl = '';
      if (this.data.fileList.length > 0) {
        console.log('开始上传图片:', this.data.fileList[0].url);
        photoUrl = await this.uploadImage(this.data.fileList[0].url);
        console.log('图片上传成功:', photoUrl);
      }
      
      // 调用签到云函数
      console.log('调用checkIn云函数:', {
        assignmentId: this.data.assignmentId,
        hasPhoto: !!photoUrl
      });
      
      const res = await wx.cloud.callFunction({
        name: 'checkIn',
        data: {
          assignmentId: this.data.assignmentId,
          type: 'check_in',
          location: this.data.location,
          photoUrl,
          remark: this.data.remark
        }
      });
      
      Toast.clear();
      
      if (res.result.code === 0) {
        Toast.success('签到成功');
        // 刷新打卡记录显示
        await this.loadTodayCheckRecord();
        // 切换到签退模式，不返回上一页
        this.setData({ 
          type: 'checkout',
          fileList: [],
          remark: ''
        });
        this.checkCanSubmit();
      } else {
        Toast.fail(res.result.message || '签到失败');
      }
    } catch (err) {
      Toast.clear();
      console.error('签到失败:', err);
      Toast.fail(err.message || '签到失败，请重试');
    } finally {
      this.setData({ isSubmitting: false });
    }
  },

  // 签退
  async handleCheckOut() {
    if (!this.data.canCheckOut) return;
    
    this.setData({ isSubmitting: true });
    Toast.loading({ message: '签退中...', forbidClick: true, duration: 0 });
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'checkIn',
        data: {
          assignmentId: this.data.assignmentId,
          type: 'check_out',
          location: this.data.location,
          remark: this.data.remark
        }
      });
      
      Toast.clear();
      
      if (res.result.code === 0) {
        Toast.success('签退成功');
        // 刷新打卡记录显示
        await this.loadTodayCheckRecord();
        // 切换回签到模式，允许重新打卡
        this.setData({ 
          type: 'checkin',
          fileList: [],
          remark: ''
        });
        this.checkCanSubmit();
      } else {
        Toast.fail(res.result.message || '签退失败');
      }
    } catch (err) {
      Toast.clear();
      console.error('签退失败:', err);
      Toast.fail(err.message || '签退失败，请重试');
    } finally {
      this.setData({ isSubmitting: false });
    }
  },

  // 上传图片 - 使用云存储直接上传
  async uploadImage(filePath) {
    try {
      // 直接使用 wx.cloud.uploadFile 上传临时文件
      const cloudPath = `checkin/${Date.now()}-${Math.random().toString(36).substr(2, 6)}.jpg`;
      
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath
      });
      
      console.log('uploadImage success:', uploadRes);
      return uploadRes.fileID;
    } catch (err) {
      console.error('uploadImage failed:', err);
      throw err;
    }
  },

  formatTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
});
