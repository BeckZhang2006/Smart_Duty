import Toast from '@vant/weapp/toast/toast';

const app = getApp();

Page({
  data: {
    selectedDuty: null,
    selectedUser: null,
    selectedTargetDuty: null,
    reason: '',
    myDuties: [],
    userList: [],
    targetUserDuties: [],
    showDutyPicker: false,
    showUserPicker: false,
    showTargetDutyPicker: false,
    loading: false
  },

  onLoad() {
    this.loadMyDuties();
    this.loadUsers();
  },

  async loadMyDuties() {
    const app = getApp();
    const today = app.getLocalDateString();
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'getAssignments',
        data: {
          startDate: today,
          endDate: '2099-12-31'
        }
      });
      
      if (res.result.code === 0) {
        // 过滤出可以换班的排班（未完成的）
        const duties = res.result.data.filter(d => 
          d.status !== 'checked_out' && !d.isSwapped
        );
        this.setData({ myDuties: duties });
      } else {
        Toast('加载排班失败: ' + res.result.message);
      }
    } catch (err) {
      console.error('加载排班失败:', err);
      Toast('加载排班失败');
    }
  },

  async loadUsers() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUsers',
        data: { excludeCurrentUser: true }
      });
      
      if (res.result.code === 0) {
        this.setData({ userList: res.result.data });
      }
    } catch (err) {
      console.error('加载用户失败:', err);
    }
  },

  async loadTargetUserDuties(userId) {
    const app = getApp();
    const today = app.getLocalDateString();
    
    try {
      // 获取目标用户的排班
      const res = await wx.cloud.callFunction({
        name: 'getAssignments',
        data: {
          userId: userId,
          startDate: today,
          endDate: '2099-12-31'
        }
      });
      
      if (res.result.code === 0) {
        const duties = res.result.data.filter(d => 
          d.status !== 'checked_out' && !d.isSwapped
        );
        this.setData({ targetUserDuties: duties });
      }
    } catch (err) {
      console.error('加载对方排班失败:', err);
    }
  },

  selectMyDuty() {
    this.setData({ showDutyPicker: true });
  },

  hideDutyPicker() {
    this.setData({ showDutyPicker: false });
  },

  confirmDuty(e) {
    const item = e.currentTarget.dataset.item;
    this.setData({
      selectedDuty: item,
      showDutyPicker: false,
      selectedTargetDuty: null
    });
  },

  selectTargetUser() {
    this.setData({ showUserPicker: true });
  },

  hideUserPicker() {
    this.setData({ showUserPicker: false });
  },

  async confirmUser(e) {
    const item = e.currentTarget.dataset.item;
    this.setData({
      selectedUser: item,
      showUserPicker: false,
      selectedTargetDuty: null
    });
    await this.loadTargetUserDuties(item._id);
  },

  selectTargetDuty() {
    this.setData({ showTargetDutyPicker: true });
  },

  hideTargetDutyPicker() {
    this.setData({ showTargetDutyPicker: false });
  },

  confirmTargetDuty(e) {
    const item = e.currentTarget.dataset.item;
    this.setData({
      selectedTargetDuty: item,
      showTargetDutyPicker: false
    });
  },

  onReasonChange(e) {
    this.setData({ reason: e.detail });
  },

  async submitApply() {
    const { selectedDuty, selectedUser, selectedTargetDuty, reason } = this.data;
    
    if (!selectedDuty || !selectedUser) {
      Toast.fail('请选择排班和交换对象');
      return;
    }
    
    this.setData({ loading: true });
    Toast.loading({ message: '提交中...', forbidClick: true });
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'swapShift',
        data: {
          action: 'apply',
          fromAssignmentId: selectedDuty._id,
          toUserId: selectedUser._id,
          toAssignmentId: selectedTargetDuty ? selectedTargetDuty._id : null,
          reason: reason
        }
      });
      
      Toast.clear();
      this.setData({ loading: false });
      
      if (res.result.code === 0) {
        Toast.success('申请已提交');
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        Toast.fail(res.result.message || '提交失败');
      }
    } catch (err) {
      Toast.clear();
      this.setData({ loading: false });
      Toast.fail('提交失败');
    }
  }
});
