import Toast from '@vant/weapp/toast/toast';
import Dialog from '@vant/weapp/dialog/dialog';

const app = getApp();

Page({
  data: {
    userId: '',
    userInfo: null,
    form: {
      realName: '',
      phone: '',
      department: '',
      role: 'staff'
    },
    departments: ['技术部', '运营部', '市场部', '人事部', '财务部', '其他'],
    roles: [
      { value: 'staff', text: '普通员工' },
      { value: 'admin', text: '管理员' }
    ],
    loading: false,
    showRolePicker: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ userId: options.id });
      this.loadUser(options.id);
    }
  },

  async loadUser(id) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUsers',
        data: { userId: id }
      });
      
      if (res.result.code === 0) {
        const user = res.result.data;
        this.setData({
          userInfo: user,
          form: {
            realName: user.realName || '',
            phone: user.phone || '',
            department: user.department || '',
            role: user.role || 'staff'
          }
        });
      }
    } catch (err) {
      console.error('加载用户失败:', err);
      Toast.fail('加载失败');
    }
  },

  onRealNameChange(e) {
    this.setData({ 'form.realName': e.detail });
  },

  onPhoneChange(e) {
    this.setData({ 'form.phone': e.detail });
  },

  onDepartmentChange(e) {
    this.setData({ 'form.department': this.data.departments[e.detail.index] });
  },

  showRolePicker() {
    this.setData({ showRolePicker: true });
  },

  onRoleConfirm(e) {
    this.setData({
      'form.role': e.detail.value.value,
      showRolePicker: false
    });
  },

  hideRolePicker() {
    this.setData({ showRolePicker: false });
  },

  async saveUser() {
    const { form, userId } = this.data;
    
    // 表单验证
    if (!form.realName.trim()) {
      Toast('请输入真实姓名');
      return;
    }
    
    if (!form.phone.trim()) {
      Toast('请输入手机号');
      return;
    }
    
    if (!/^1[3-9]\d{9}$/.test(form.phone)) {
      Toast('请输入正确的手机号');
      return;
    }
    
    this.setData({ loading: true });
    
    try {
      await wx.cloud.callFunction({
        name: 'updateUser',
        data: {
          userId,
          ...form
        }
      });
      
      Toast.success('保存成功');
      setTimeout(() => wx.navigateBack(), 1500);
    } catch (err) {
      console.error('保存用户失败:', err);
      Toast.fail('保存失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  deleteUser() {
    const { userId } = this.data;
    
    Dialog.confirm({
      title: '确认删除',
      message: '删除后该用户将无法登录，确定要删除吗？'
    }).then(async () => {
      try {
        Toast.loading({ message: '删除中...', forbidClick: true });
        
        await wx.cloud.callFunction({
          name: 'deleteUser',
          data: { userId }
        });
        
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
