import Toast from '@vant/weapp/toast/toast';

const app = getApp();

Page({
  data: {
    overview: {
      totalStaff: 0,
      todayShifts: 0,
      pendingSwaps: 0
    },
    todayAssignments: [],
    pendingSwaps: [],
    recentNotices: []
  },

  onLoad() {
    // 检查登录状态
    app.checkLoginStatus().then(isLoggedIn => {
      if (!isLoggedIn) return;
      
      if (!app.globalData.isAdmin) {
        Toast('您没有管理员权限');
        wx.switchTab({ url: '/pages/index/index' });
        return;
      }
      
      this.loadData();
    });
  },

  onShow() {
    if (app.globalData.isAdmin) {
      this.loadData();
    }
  },

  async loadData() {
    wx.showLoading({ title: '加载中' });
    
    try {
      await Promise.all([
        this.loadOverview(),
        this.loadTodaySchedule(),
        this.loadPendingSwaps(),
        this.loadRecentNotices()
      ]);
    } catch (err) {
      console.error('加载数据失败:', err);
    } finally {
      wx.hideLoading();
    }
  },

  // 加载概览数据
  async loadOverview() {
    // 获取人员数量
    const userRes = await wx.cloud.callFunction({
      name: 'getUsers',
      data: { action: 'count' }
    });
    
    // 获取今日排班数
    const today = app.getLocalDateString();
    const assignRes = await wx.cloud.callFunction({
      name: 'getAssignments',
      data: {
        startDate: today,
        endDate: today
      }
    });
    
    // 获取待处理换班数
    const swapRes = await wx.cloud.callFunction({
      name: 'swapShift',
      data: { action: 'list', type: 'all' }
    });
    
    const pendingSwaps = swapRes.result.code === 0 
      ? swapRes.result.data.filter(s => s.status === 'pending').length 
      : 0;
    
    this.setData({
      overview: {
        totalStaff: userRes.result?.data?.count || 0,
        todayShifts: assignRes.result.code === 0 ? assignRes.result.data.length : 0,
        pendingSwaps
      }
    });
  },

  // 加载今日排班
  async loadTodaySchedule() {
    const today = app.getLocalDateString();
    const res = await wx.cloud.callFunction({
      name: 'getAssignments',
      data: {
        startDate: today,
        endDate: today
      }
    });
    
    if (res.result.code === 0) {
      this.setData({
        todayAssignments: res.result.data.slice(0, 5)
      });
    }
  },

  // 加载待处理换班
  async loadPendingSwaps() {
    const res = await wx.cloud.callFunction({
      name: 'swapShift',
      data: { action: 'list', type: 'all' }
    });
    
    if (res.result.code === 0) {
      const pending = res.result.data
        .filter(s => s.status === 'pending')
        .slice(0, 3);
      this.setData({ pendingSwaps: pending });
    }
  },

  // 加载最近公告
  async loadRecentNotices() {
    const res = await wx.cloud.callFunction({
      name: 'notice',
      data: { action: 'list', limit: 5 }
    });
    
    if (res.result.code === 0) {
      this.setData({ recentNotices: res.result.data });
    }
  },

  // 审批换班
  async approveSwap(e) {
    const id = e.currentTarget.dataset.id;
    
    wx.showLoading({ title: '处理中' });
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'swapShift',
        data: { action: 'approve', swapId: id }
      });
      
      if (res.result.code === 0) {
        Toast.success('已同意');
        this.loadPendingSwaps();
      } else {
        Toast(res.result.message);
      }
    } catch (err) {
      Toast('操作失败');
    } finally {
      wx.hideLoading();
    }
  },

  async rejectSwap(e) {
    const id = e.currentTarget.dataset.id;
    
    wx.showModal({
      title: '拒绝换班',
      content: '确定拒绝此换班申请吗？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中' });
          
          try {
            const result = await wx.cloud.callFunction({
              name: 'swapShift',
              data: { action: 'reject', swapId: id, remark: '' }
            });
            
            if (result.result.code === 0) {
              Toast.success('已拒绝');
              this.loadPendingSwaps();
            } else {
              Toast(result.result.message);
            }
          } catch (err) {
            Toast('操作失败');
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  },

  getStatusType(status) {
    const map = {
      'pending': 'warning',
      'checked_in': 'primary',
      'checked_out': 'success',
      'absent': 'danger'
    };
    return map[status] || 'default';
  },

  getStatusText(status) {
    const map = {
      'pending': '待签到',
      'checked_in': '值班中',
      'checked_out': '已完成',
      'absent': '缺勤'
    };
    return map[status] || status;
  },

  formatTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  },

  // 页面跳转
  goToGenerateSchedule() {
    wx.navigateTo({ url: '/pages/admin/schedule-generate/schedule-generate' });
  },

  goToManageSchedule() {
    wx.navigateTo({ url: '/pages/admin/schedule' });
  },

  goToManageUsers() {
    wx.navigateTo({ url: '/pages/admin/users' });
  },

  goToManageShifts() {
    wx.navigateTo({ url: '/pages/admin/shifts' });
  },

  goToApproveSwaps() {
    wx.navigateTo({ url: '/pages/admin/swaps' });
  },

  goToStatistics() {
    wx.switchTab({ url: '/pages/statistics/statistics' });
  },

  goToHolidays() {
    wx.navigateTo({ url: '/pages/admin/holidays/holidays' });
  },

  goToNotices() {
    wx.navigateTo({ url: '/pages/admin/notices' });
  },

  goToExport() {
    wx.navigateTo({ url: '/pages/admin/export/export' });
  }
});
