import Toast from '@vant/weapp/toast/toast';
import Dialog from '@vant/weapp/dialog/dialog';

const app = getApp();

Page({
  data: {
    assignmentId: '',
    assignmentInfo: null,
    form: {
      date: '',
      shiftId: '',
      userId: ''
    },
    shifts: [],
    users: [],
    shiftColumns: [],
    userColumns: [],
    loading: false,
    showDatePicker: false,
    showShiftPicker: false,
    showUserPicker: false,
    minDate: new Date(2020, 0, 1).getTime(),
    maxDate: new Date(2030, 11, 31).getTime(),
    currentDate: new Date().getTime()
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ assignmentId: options.id });
      this.loadAssignment(options.id);
    } else {
      // 新建模式，初始化日期为今天
      const today = this.formatDate(new Date());
      this.setData({
        'form.date': today,
        currentDate: new Date().getTime()
      });
      this.loadShiftsAndUsers();
    }
  },

  // 格式化日期为 YYYY-MM-DD
  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 加载排班详情
  async loadAssignment(id) {
    try {
      Toast.loading({ message: '加载中...', forbidClick: true });

      const db = wx.cloud.database();
      const res = await db.collection('assignments').doc(id).get();

      if (res.data) {
        const assignment = res.data;
        this.setData({
          assignmentInfo: assignment,
          form: {
            date: assignment.date,
            shiftId: assignment.shiftId,
            userId: assignment.userId
          }
        });

        // 加载班次和人员列表
        await this.loadShiftsAndUsers();

        // 设置当前显示的班次和人员名称
        this.updateSelectedNames();
      }

      Toast.clear();
    } catch (err) {
      Toast.clear();
      console.error('加载排班失败:', err);
      Toast.fail('加载失败');
    }
  },

  // 加载班次和用户列表
  async loadShiftsAndUsers() {
    try {
      const db = wx.cloud.database();

      // 获取所有班次
      const shiftsRes = await db.collection('shifts').orderBy('createTime', 'asc').get();
      const shifts = shiftsRes.data || [];
      const shiftColumns = shifts.map(s => ({ text: s.name, value: s._id }));

      // 获取所有用户
      const usersRes = await db.collection('users').orderBy('realName', 'asc').get();
      const users = usersRes.data || [];
      const userColumns = users.map(u => ({ text: u.realName || u.nickName || '未命名', value: u._id }));

      this.setData({
        shifts,
        users,
        shiftColumns,
        userColumns
      });

      // 如果有选中的值，更新显示名称
      this.updateSelectedNames();
    } catch (err) {
      console.error('加载数据失败:', err);
    }
  },

  // 更新选中的班次和人员显示名称
  updateSelectedNames() {
    const { form, shifts, users } = this.data;
    
    const selectedShift = shifts.find(s => s._id === form.shiftId);
    const selectedUser = users.find(u => u._id === form.userId);

    this.setData({
      selectedShiftName: selectedShift ? selectedShift.name : '请选择班次',
      selectedUserName: selectedUser ? (selectedUser.realName || selectedUser.nickName || '未命名') : '请选择人员'
    });
  },

  // 显示日期选择器
  showDatePicker() {
    const { form } = this.data;
    const date = form.date ? new Date(form.date) : new Date();
    this.setData({
      showDatePicker: true,
      currentDate: date.getTime()
    });
  },

  // 隐藏日期选择器
  hideDatePicker() {
    this.setData({ showDatePicker: false });
  },

  // 日期选择确认
  onDateConfirm(e) {
    const date = new Date(e.detail);
    const dateStr = this.formatDate(date);
    this.setData({
      'form.date': dateStr,
      showDatePicker: false
    });
  },

  // 显示班次选择器
  showShiftPicker() {
    this.setData({ showShiftPicker: true });
  },

  // 隐藏班次选择器
  hideShiftPicker() {
    this.setData({ showShiftPicker: false });
  },

  // 班次选择确认
  onShiftConfirm(e) {
    const { value } = e.detail;
    this.setData({
      'form.shiftId': value.value,
      selectedShiftName: value.text,
      showShiftPicker: false
    });
  },

  // 显示人员选择器
  showUserPicker() {
    this.setData({ showUserPicker: true });
  },

  // 隐藏人员选择器
  hideUserPicker() {
    this.setData({ showUserPicker: false });
  },

  // 人员选择确认
  onUserConfirm(e) {
    const { value } = e.detail;
    this.setData({
      'form.userId': value.value,
      selectedUserName: value.text,
      showUserPicker: false
    });
  },

  // 表单验证
  validateForm() {
    const { form } = this.data;

    if (!form.date) {
      Toast('请选择日期');
      return false;
    }

    if (!form.shiftId) {
      Toast('请选择班次');
      return false;
    }

    if (!form.userId) {
      Toast('请选择人员');
      return false;
    }

    return true;
  },

  // 保存排班
  async saveAssignment() {
    if (!this.validateForm()) {
      return;
    }

    const { form, assignmentId } = this.data;

    this.setData({ loading: true });

    try {
      // 获取班次和用户信息
      const db = wx.cloud.database();
      const [shiftRes, userRes] = await Promise.all([
        db.collection('shifts').doc(form.shiftId).get(),
        db.collection('users').doc(form.userId).get()
      ]);

      const assignmentData = {
        date: form.date,
        shiftId: form.shiftId,
        userId: form.userId,
        updateTime: db.serverDate()
      };

      if (assignmentId) {
        // 更新现有排班
        await db.collection('assignments').doc(assignmentId).update({
          data: assignmentData
        });
        Toast.success('更新成功');
      } else {
        // 新建排班
        await db.collection('assignments').add({
          data: {
            ...assignmentData,
            status: 'pending',
            createTime: db.serverDate()
          }
        });
        Toast.success('创建成功');
      }

      setTimeout(() => wx.navigateBack(), 1500);
    } catch (err) {
      console.error('保存排班失败:', err);
      Toast.fail('保存失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  // 删除排班
  deleteAssignment() {
    const { assignmentId } = this.data;

    if (!assignmentId) {
      Toast('无效的排班ID');
      return;
    }

    Dialog.confirm({
      title: '确认删除',
      message: '删除后无法恢复，确定要删除这个排班吗？'
    }).then(async () => {
      try {
        Toast.loading({ message: '删除中...', forbidClick: true });

        const db = wx.cloud.database();
        await db.collection('assignments').doc(assignmentId).remove();

        Toast.clear();
        Toast.success('已删除');
        setTimeout(() => wx.navigateBack(), 1500);
      } catch (err) {
        Toast.clear();
        console.error('删除排班失败:', err);
        Toast.fail('删除失败');
      }
    }).catch(() => {});
  }
});
