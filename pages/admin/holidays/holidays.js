import Toast from '@vant/weapp/toast/toast';
import Dialog from '@vant/weapp/dialog/dialog';

const app = getApp();

Page({
  data: {
    holidays: [],
    loading: false,
    showAddDialog: false,
    showTypePicker: false,
    showDatePicker: false,
    currentDate: new Date().getTime(),
    form: {
      date: '',
      name: '',
      type: 'holiday'
    },
    typeColumns: [
      { text: '法定节假日', value: 'holiday' },
      { text: '调休日', value: 'workday' },
      { text: '其他', value: 'other' }
    ],
    minDate: new Date(2024, 0, 1).getTime(),
    maxDate: new Date(2030, 11, 31).getTime()
  },

  onLoad() {
    this.checkAdmin();
    this.loadHolidays();
  },

  onShow() {
    if (app.globalData.isAdmin) {
      this.loadHolidays();
    }
  },

  checkAdmin() {
    if (!app.globalData.isAdmin) {
      Toast('您没有管理员权限');
      wx.switchTab({ url: '/pages/index/index' });
      return;
    }
  },

  async loadHolidays() {
    this.setData({ loading: true });
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'holiday',
        data: { action: 'list' }
      });
      
      if (res.result.code === 0) {
        // 按日期排序
        const holidays = res.result.data.sort((a, b) => {
          return new Date(a.date) - new Date(b.date);
        });
        this.setData({ holidays });
      } else {
        Toast.fail(res.result.message || '加载失败');
      }
    } catch (err) {
      console.error('加载节假日失败:', err);
      Toast.fail('加载失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  // 显示添加弹窗
  showAddDialog() {
    const today = app.getLocalDateString();
    this.setData({
      showAddDialog: true,
      currentDate: new Date().getTime(),
      form: {
        date: today,
        name: '',
        type: 'holiday'
      }
    });
  },

  // 显示日期选择器
  showDatePicker() {
    const { form } = this.data;
    // 将日期字符串转换为时间戳
    let timestamp = new Date().getTime();
    if (form.date) {
      timestamp = new Date(form.date).getTime();
    }
    this.setData({
      showDatePicker: true,
      currentDate: timestamp
    });
  },

  // 关闭日期选择器
  onCloseDatePicker() {
    this.setData({ showDatePicker: false });
  },

  // 确认日期选择
  onDateConfirm(e) {
    const timestamp = e.detail;
    this.setData({
      'form.date': this.formatDate(timestamp),
      showDatePicker: false
    });
  },

  // 关闭添加弹窗
  onCloseDialog() {
    this.setData({ showAddDialog: false });
  },



  // 名称输入
  onNameChange(e) {
    this.setData({
      'form.name': e.detail
    });
  },

  // 显示类型选择器
  showTypePicker() {
    this.setData({ showTypePicker: true });
  },

  // 关闭类型选择器
  onCloseTypePicker() {
    this.setData({ showTypePicker: false });
  },

  // 确认类型选择
  onTypeConfirm(e) {
    const { value } = e.detail;
    this.setData({
      'form.type': value.value,
      showTypePicker: false
    });
  },

  // 获取类型文本
  getTypeText(type) {
    const map = {
      'holiday': '法定节假日',
      'workday': '调休日',
      'other': '其他'
    };
    return map[type] || '其他';
  },

  // 获取类型标签颜色
  getTypeColor(type) {
    const map = {
      'holiday': 'danger',
      'workday': 'primary',
      'other': 'default'
    };
    return map[type] || 'default';
  },

  // 提交添加
  async onSubmit() {
    const { date, name, type } = this.data.form;
    
    if (!date || !name) {
      Toast('请填写完整信息');
      return;
    }
    
    wx.showLoading({ title: '保存中' });
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'holiday',
        data: {
          action: 'create',
          date,
          name,
          type
        }
      });
      
      if (res.result.code === 0) {
        Toast.success('添加成功');
        this.setData({ showAddDialog: false });
        this.loadHolidays();
      } else {
        Toast.fail(res.result.message || '添加失败');
      }
    } catch (err) {
      console.error('添加节假日失败:', err);
      Toast.fail('添加失败');
    } finally {
      wx.hideLoading();
    }
  },

  // 删除节假日
  onDelete(e) {
    const { id, name } = e.currentTarget.dataset;
    
    Dialog.confirm({
      title: '确认删除',
      message: `确定删除「${name}」吗？`
    }).then(() => {
      this.doDelete(id);
    }).catch(() => {
      // 取消
    });
  },

  async doDelete(id) {
    wx.showLoading({ title: '删除中' });
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'holiday',
        data: {
          action: 'delete',
          id
        }
      });
      
      if (res.result.code === 0) {
        Toast.success('删除成功');
        this.loadHolidays();
      } else {
        Toast.fail(res.result.message || '删除失败');
      }
    } catch (err) {
      console.error('删除节假日失败:', err);
      Toast.fail('删除失败');
    } finally {
      wx.hideLoading();
    }
  },

  // 格式化日期
  formatDate(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 格式化显示日期
  formatDisplayDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekDay = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
    return `${month}月${day}日 周${weekDay}`;
  }
});
