import Toast from '@vant/weapp/toast/toast';

const app = getApp();

Page({
  data: {
    // 周模板配置
    weekTemplate: [
      { day: '', night: '' }, // 周一
      { day: '', night: '' }, // 周二
      { day: '', night: '' }, // 周三
      { day: '', night: '' }, // 周四
      { day: '', night: '' }  // 周五
    ],
    weekdays: ['周一', '周二', '周三', '周四', '周五'],
    
    // 日期范围
    startDate: '',
    endDate: '',
    
    // 人员列表
    staffList: [],
    
    // 加载状态
    loading: false
  },

  onLoad() {
    this.loadStaffList();
    this.initDateRange();
  },

  // 初始化日期范围（默认当前学期）
  initDateRange() {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    
    // 默认从下周一开始，生成4周
    const nextMonday = this.getNextMonday(today);
    const endDate = new Date(nextMonday);
    endDate.setDate(endDate.getDate() + 27); // 4周
    
    this.setData({
      startDate: this.formatDate(nextMonday),
      endDate: this.formatDate(endDate)
    });
  },

  // 获取下周一
  getNextMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = 8 - day; // 到下周一的天数
    d.setDate(d.getDate() + diff);
    return d;
  },

  // 格式化日期
  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 加载人员列表
  async loadStaffList() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUsers',
        data: {}
      });
      
      if (res.result.code === 0) {
        this.setData({
          staffList: res.result.data.filter(u => u.role !== 'admin')
        });
      }
    } catch (err) {
      console.error('加载人员失败:', err);
    }
  },

  // 选择白天班人员
  onDayStaffChange(e) {
    const { index } = e.currentTarget.dataset;
    const staffIndex = e.detail.value;
    const staffName = this.data.staffList[staffIndex]?.realName || '';
    
    this.setData({
      [`weekTemplate[${index}].day`]: staffName
    });
  },

  // 选择晚上班人员
  onNightStaffChange(e) {
    const { index } = e.currentTarget.dataset;
    const staffIndex = e.detail.value;
    const staffName = this.data.staffList[staffIndex]?.realName || '';
    
    this.setData({
      [`weekTemplate[${index}].night`]: staffName
    });
  },

  // 日期选择
  onStartDateChange(e) {
    this.setData({ startDate: e.detail.value });
  },

  onEndDateChange(e) {
    this.setData({ endDate: e.detail.value });
  },

  // 加载默认模板
  loadDefaultTemplate() {
    // 电教中心默认排班
    const defaultTemplate = [
      { day: '王超然', night: '尚攸成' },
      { day: '王家祎', night: '徐丞昱' },
      { day: '孔馨晨', night: '张兆睿' },
      { day: '张兆睿', night: '王家祎' },
      { day: '尚攸成', night: '孔馨晨' }
    ];
    
    this.setData({ weekTemplate: defaultTemplate });
    Toast.success('已加载默认模板');
  },

  // 清空模板
  clearTemplate() {
    this.setData({
      weekTemplate: [
        { day: '', night: '' },
        { day: '', night: '' },
        { day: '', night: '' },
        { day: '', night: '' },
        { day: '', night: '' }
      ]
    });
  },

  // 生成排班
  async generateSchedule() {
    const { weekTemplate, startDate, endDate } = this.data;
    
    // 验证
    const hasEmpty = weekTemplate.some(d => !d.day || !d.night);
    if (hasEmpty) {
      Toast('请完善每天的值班人员');
      return;
    }
    
    if (!startDate || !endDate) {
      Toast('请选择日期范围');
      return;
    }
    
    if (new Date(startDate) > new Date(endDate)) {
      Toast('开始日期不能晚于结束日期');
      return;
    }
    
    this.setData({ loading: true });
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'generateWeeklySchedule',
        data: {
          weekTemplate,
          startDate,
          endDate
        }
      });
      
      if (res.result.code === 0) {
        Toast.success(res.result.message);
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        Toast.fail(res.result.message);
      }
    } catch (err) {
      console.error('生成排班失败:', err);
      Toast.fail('生成失败');
    } finally {
      this.setData({ loading: false });
    }
  }
});
