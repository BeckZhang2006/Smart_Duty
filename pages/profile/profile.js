import Toast from '@vant/weapp/toast/toast';

const app = getApp();

Page({
  data: {
    userInfo: {},
    isAdmin: false,
    stats: {
      monthShifts: 0,
      completedShifts: 0,
      totalHours: 0,
      pendingSwaps: 0,
      pendingApprovals: 0
    }
  },

  onLoad() {
    // 检查登录状态
    app.checkLoginStatus().then(isLoggedIn => {
      if (!isLoggedIn) return;
      
      if (app.globalData.userInfo) {
        this.setData({
          userInfo: app.globalData.userInfo,
          isAdmin: app.globalData.isAdmin
        });
        this.loadStats();
      } else {
        app.userInfoReadyCallback = (data) => {
          this.setData({
            userInfo: data.userInfo,
            isAdmin: data.isAdmin
          });
          this.loadStats();
        };
      }
    });
  },

  onShow() {
    if (this.data.userInfo._id) {
      this.loadStats();
    }
  },

  async loadStats() {
    const month = app.getLocalMonthString();
    
    try {
      // 获取个人统计
      const statsRes = await wx.cloud.callFunction({
        name: 'getStatistics',
        data: {
          type: 'personal',
          month
        }
      });
      
      if (statsRes.result.code === 0) {
        const summary = statsRes.result.data.summary;
        this.setData({
          'stats.monthShifts': summary.totalShifts || 0,
          'stats.completedShifts': summary.completedShifts || 0,
          'stats.totalHours': Math.round(summary.totalWorkHours || 0)
        });
      }
      
      // 获取待处理换班数
      const swapRes = await wx.cloud.callFunction({
        name: 'swapShift',
        data: { action: 'list', type: 'received' }
      });
      
      if (swapRes.result.code === 0) {
        const pending = swapRes.result.data.filter(s => s.status === 'pending').length;
        this.setData({
          'stats.pendingSwaps': pending
        });
      }
      
      // 管理员获取待审批数
      if (this.data.isAdmin) {
        const allSwapRes = await wx.cloud.callFunction({
          name: 'swapShift',
          data: { action: 'list', type: 'all' }
        });
        
        if (allSwapRes.result.code === 0) {
          const pendingApprovals = allSwapRes.result.data.filter(s => s.status === 'pending').length;
          this.setData({ 'stats.pendingApprovals': pendingApprovals });
        }
      }
    } catch (err) {
      console.error('加载统计失败:', err);
    }
  },

  // 页面跳转
  goToMySchedule() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  goToMyRecords() {
    wx.navigateTo({ url: '/pages/records/records' });
  },

  goToSwaps() {
    wx.navigateTo({ url: '/pages/swap/swap' });
  },

  goToStatistics() {
    wx.switchTab({ url: '/pages/statistics/statistics' });
  },

  goToScheduleManage() {
    wx.navigateTo({ url: '/pages/admin/schedule' });
  },

  goToUserManage() {
    wx.navigateTo({ url: '/pages/admin/users' });
  },

  goToShiftSetting() {
    wx.navigateTo({ url: '/pages/admin/shifts' });
  },

  goToSwapApprove() {
    wx.navigateTo({ url: '/pages/admin/swaps' });
  },

  goToTeamStatistics() {
    wx.switchTab({ url: '/pages/statistics/statistics' });
  },

  goToNoticeManage() {
    wx.navigateTo({ url: '/pages/admin/notices' });
  },

  editProfile() {
    wx.navigateTo({ url: '/pages/profile/edit' });
  },

  aboutUs() {
    wx.showModal({
      title: '关于',
      content: '值班管理小程序 v1.0.0\n\n提供排班、打卡、统计一体化解决方案',
      showCancel: false
    });
  },

  // 客服功能 - 暂时禁用并显示提示
  contactService() {
    wx.showModal({
      title: '联系客服',
      content: '客服功能正在配置中，请稍后再试。\n\n如有紧急问题，请联系管理员。',
      showCancel: false,
      confirmText: '知道了'
    });
    
    // TODO: 配置完成后启用以下代码
    // wx.openCustomerServiceChat({
    //   extInfo: { url: '' },
    //   corpId: 'YOUR_CORP_ID',
    //   success: () => {},
    //   fail: (err) => {
    //     console.error('打开客服失败:', err);
    //     Toast('客服功能暂不可用');
    //   }
    // });
  }
});
