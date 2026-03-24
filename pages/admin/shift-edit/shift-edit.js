import Toast from '@vant/weapp/toast/toast';
import Dialog from '@vant/weapp/dialog/dialog';

const app = getApp();

Page({
  data: {
    shiftId: '',
    isEdit: false,
    form: {
      name: '',
      // 支持多时间段
      timeSlots: [
        { startTime: '09:00', endTime: '18:00' }
      ],
      location: {
        name: '默认打卡点',
        latitude: 36.67787272135417,
        longitude: 116.97408718532986,
        radius: 500
      },
      color: '#07c160',
      description: ''
    },
    colors: [
      { value: '#07c160', name: '绿色' },
      { value: '#1989fa', name: '蓝色' },
      { value: '#ff4d4f', name: '红色' },
      { value: '#ff9500', name: '橙色' },
      { value: '#722ed1', name: '紫色' },
      { value: '#eb2f96', name: '粉色' }
    ],
    loading: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ 
        shiftId: options.id,
        isEdit: true 
      });
      this.loadShift(options.id);
    }
  },

  async loadShift(id) {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('shifts').doc(id).get();
      
      this.setData({
        form: res.data
      });
    } catch (err) {
      console.error('加载班次失败:', err);
      Toast.fail('加载失败');
    }
  },

  onNameChange(e) {
    this.setData({ 'form.name': e.detail });
  },

  onStartTimeChange(e) {
    this.setData({ 'form.startTime': e.detail });
  },

  onEndTimeChange(e) {
    this.setData({ 'form.endTime': e.detail });
  },

  onLocationNameChange(e) {
    this.setData({ 'form.location.name': e.detail });
  },

  onRadiusChange(e) {
    this.setData({ 'form.location.radius': parseInt(e.detail) || 500 });
  },

  onColorSelect(e) {
    this.setData({ 'form.color': e.currentTarget.dataset.color });
  },

  onDescriptionChange(e) {
    this.setData({ 'form.description': e.detail });
  },

  // 添加时间段
  addTimeSlot() {
    const { form } = this.data;
    const timeSlots = form.timeSlots || [];
    timeSlots.push({ startTime: '09:00', endTime: '18:00' });
    this.setData({ 'form.timeSlots': timeSlots });
  },

  // 删除时间段
  removeTimeSlot(e) {
    const { index } = e.currentTarget.dataset;
    const { form } = this.data;
    const timeSlots = form.timeSlots || [];
    if (timeSlots.length > 1) {
      timeSlots.splice(index, 1);
      this.setData({ 'form.timeSlots': timeSlots });
    } else {
      Toast('至少保留一个时间段');
    }
  },

  // 修改时间段开始时间
  onTimeSlotStartChange(e) {
    const { index } = e.currentTarget.dataset;
    this.setData({ [`form.timeSlots[${index}].startTime`]: e.detail });
  },

  // 修改时间段结束时间
  onTimeSlotEndChange(e) {
    const { index } = e.currentTarget.dataset;
    this.setData({ [`form.timeSlots[${index}].endTime`]: e.detail });
  },

  async saveShift() {
    const { form, isEdit, shiftId } = this.data;
    
    // 表单验证
    if (!form.name.trim()) {
      Toast('请输入班次名称');
      return;
    }
    
    // 验证时间段
    const timeSlots = form.timeSlots || [];
    for (let i = 0; i < timeSlots.length; i++) {
      if (timeSlots[i].startTime >= timeSlots[i].endTime) {
        Toast(`第${i + 1}个时间段开始时间必须早于结束时间`);
        return;
      }
    }
    
    // 兼容旧数据：如果有多时间段，使用第一个作为主时间
    if (timeSlots.length > 0) {
      form.startTime = timeSlots[0].startTime;
      form.endTime = timeSlots[0].endTime;
    }
    
    this.setData({ loading: true });
    
    try {
      const db = wx.cloud.database();
      
      if (isEdit) {
        await db.collection('shifts').doc(shiftId).update({
          data: {
            ...form,
            updateTime: db.serverDate()
          }
        });
      } else {
        await db.collection('shifts').add({
          data: {
            ...form,
            createTime: db.serverDate(),
            updateTime: db.serverDate()
          }
        });
      }
      
      Toast.success('保存成功');
      setTimeout(() => wx.navigateBack(), 1500);
    } catch (err) {
      console.error('保存班次失败:', err);
      Toast.fail('保存失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  deleteShift() {
    const { shiftId } = this.data;
    
    Dialog.confirm({
      title: '确认删除',
      message: '删除后无法恢复，确定要删除这个班次吗？'
    }).then(async () => {
      try {
        Toast.loading({ message: '删除中...', forbidClick: true });
        
        const db = wx.cloud.database();
        await db.collection('shifts').doc(shiftId).remove();
        
        Toast.clear();
        Toast.success('已删除');
        setTimeout(() => wx.navigateBack(), 1500);
      } catch (err) {
        Toast.clear();
        Toast.fail('删除失败');
      }
    }).catch(() => {});
  }
});
