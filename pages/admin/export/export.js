import Toast from '@vant/weapp/toast/toast';

const app = getApp();

Page({
  data: {
    // 导出类型
    exportType: 'exportSchedule',
    exportTypes: [
      { value: 'exportSchedule', label: '排班表' },
      { value: 'exportCheckRecords', label: '打卡记录' },
      { value: 'exportStatistics', label: '统计数据' }
    ],

    // 日期范围
    startDate: '',
    endDate: '',
    month: '',

    // 人员选择（打卡记录可选）
    userId: '',
    userName: '全部人员',
    staffList: [],
    showUserPicker: false,

    // 导出状态
    loading: false,
    exportResult: null
  },

  onLoad() {
    // 检查管理员权限
    app.checkLoginStatus().then(isLoggedIn => {
      if (!isLoggedIn) return;
      
      if (!app.globalData.isAdmin) {
        Toast('您没有管理员权限');
        wx.switchTab({ url: '/pages/index/index' });
        return;
      }
    });

    this.initDates();
    this.loadStaffList();
  },

  // 初始化日期
  initDates() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const currentMonth = `${year}-${month}`;
    const currentDate = `${year}-${month}-${day}`;

    // 获取本月第一天和最后一天
    const firstDay = `${currentMonth}-01`;
    const lastDay = `${currentMonth}-${new Date(year, today.getMonth() + 1, 0).getDate()}`;

    this.setData({
      month: currentMonth,
      startDate: firstDay,
      endDate: lastDay
    });
  },

  // 加载人员列表
  async loadStaffList() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUsers',
        data: {}
      });
      
      if (res.result.code === 0) {
        const staffList = [
          { _id: '', realName: '全部人员' },
          ...res.result.data.filter(u => u.role !== 'admin')
        ];
        this.setData({ staffList });
      }
    } catch (err) {
      console.error('加载人员失败:', err);
    }
  },

  // 导出类型变更
  onExportTypeChange(e) {
    this.setData({
      exportType: e.detail,
      exportResult: null
    });
  },

  // 日期选择
  onStartDateChange(e) {
    this.setData({ startDate: e.detail.value });
  },

  onEndDateChange(e) {
    this.setData({ endDate: e.detail.value });
  },

  // 月份选择
  onMonthChange(e) {
    this.setData({ month: e.detail.value });
  },

  // 人员选择
  onSelectUser() {
    if (this.data.exportType !== 'exportCheckRecords') {
      Toast('只有导出打卡记录时可以选择人员');
      return;
    }
    this.setData({ showUserPicker: true });
  },

  onUserPickerClose() {
    this.setData({ showUserPicker: false });
  },

  onUserPickerChange(e) {
    const { picker, value, index } = e.detail;
    this.setData({
      userId: value._id,
      userName: value.realName
    });
  },

  onUserPickerConfirm() {
    this.setData({ showUserPicker: false });
  },

  // 验证参数
  validateParams() {
    const { exportType, startDate, endDate, month } = this.data;

    if (exportType === 'exportStatistics') {
      if (!month) {
        Toast('请选择月份');
        return false;
      }
    } else {
      if (!startDate || !endDate) {
        Toast('请选择日期范围');
        return false;
      }
      if (new Date(startDate) > new Date(endDate)) {
        Toast('开始日期不能晚于结束日期');
        return false;
      }
    }

    return true;
  },

  // 执行导出
  async doExport() {
    if (!this.validateParams()) return;

    const { exportType, startDate, endDate, month, userId } = this.data;

    this.setData({ loading: true, exportResult: null });

    try {
      const params = {
        action: exportType
      };

      if (exportType === 'exportStatistics') {
        params.month = month;
      } else {
        params.startDate = startDate;
        params.endDate = endDate;
        if (exportType === 'exportCheckRecords' && userId) {
          params.userId = userId;
        }
      }

      const res = await wx.cloud.callFunction({
        name: 'exportData',
        data: params
      });

      if (res.result.code === 0) {
        this.setData({
          exportResult: res.result.data
        });
        Toast.success('导出成功');
      } else {
        Toast.fail(res.result.message || '导出失败');
      }
    } catch (err) {
      console.error('导出失败:', err);
      Toast.fail('导出失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  // 复制下载链接
  copyDownloadUrl() {
    const { tempFileURL } = this.data.exportResult;
    wx.setClipboardData({
      data: tempFileURL,
      success: () => {
        Toast.success('链接已复制');
      }
    });
  },

  // 预览文件
  previewFile() {
    const { tempFileURL, filename } = this.data.exportResult;
    
    wx.showLoading({ title: '下载中' });
    
    wx.downloadFile({
      url: tempFileURL,
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode === 200) {
          wx.openDocument({
            filePath: res.tempFilePath,
            fileType: 'xlsx',
            showMenu: true
          });
        } else {
          Toast.fail('文件下载失败');
        }
      },
      fail: () => {
        wx.hideLoading();
        Toast.fail('文件下载失败');
      }
    });
  },

  // 分享到文件传输助手或保存
  saveFile() {
    const { tempFileURL, filename } = this.data.exportResult;
    
    wx.showLoading({ title: '下载中' });
    
    wx.downloadFile({
      url: tempFileURL,
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode === 200) {
          // 保存到本地（仅在支持的设备上）
          wx.saveFileToDisk ? wx.saveFileToDisk({
            filePath: res.tempFilePath,
            success: () => {
              Toast.success('文件已保存');
            },
            fail: () => {
              // 如果保存失败，提示用户手动保存
              wx.showModal({
                title: '保存提示',
                content: '请复制下载链接到浏览器中下载',
                confirmText: '复制链接',
                success: (modalRes) => {
                  if (modalRes.confirm) {
                    this.copyDownloadUrl();
                  }
                }
              });
            }
          }) : wx.showModal({
            title: '保存提示',
            content: '请复制下载链接到浏览器中下载',
            confirmText: '复制链接',
            success: (modalRes) => {
              if (modalRes.confirm) {
                this.copyDownloadUrl();
              }
            }
          });
        } else {
          Toast.fail('文件下载失败');
        }
      },
      fail: () => {
        wx.hideLoading();
        Toast.fail('文件下载失败');
      }
    });
  }
});
