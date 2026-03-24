import Toast from '@vant/weapp/toast/toast';

const app = getApp();

Page({
  data: {
    noticeId: '',
    isEdit: false,
    form: {
      title: '',
      content: '',
      type: '系统公告',
      isTop: false
    },
    typeOptions: ['系统公告', '排班通知', '其他'],
    loading: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({
        noticeId: options.id,
        isEdit: true
      });
      this.loadNotice(options.id);
    }
  },

  async loadNotice(id) {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('notices').doc(id).get();
      
      this.setData({
        form: {
          title: res.data.title || '',
          content: res.data.content || '',
          type: res.data.type || '系统公告',
          isTop: res.data.isTop || false
        }
      });
    } catch (err) {
      console.error('加载公告失败:', err);
      Toast.fail('加载失败');
    }
  },

  onTitleChange(e) {
    this.setData({ 'form.title': e.detail });
  },

  onContentChange(e) {
    this.setData({ 'form.content': e.detail });
  },

  onTypeChange(e) {
    const typeOptions = this.data.typeOptions;
    const index = e.detail;
    this.setData({ 'form.type': typeOptions[index] });
  },

  onIsTopChange(e) {
    this.setData({ 'form.isTop': e.detail });
  },

  async saveNotice() {
    const { form, isEdit, noticeId } = this.data;
    
    // 表单验证
    if (!form.title.trim()) {
      Toast('请输入公告标题');
      return;
    }
    
    if (!form.content.trim()) {
      Toast('请输入公告内容');
      return;
    }
    
    this.setData({ loading: true });
    
    try {
      const action = isEdit ? 'update' : 'create';
      const data = {
        action,
        title: form.title.trim(),
        content: form.content.trim(),
        type: form.type,
        isTop: form.isTop
      };
      
      if (isEdit) {
        data.id = noticeId;
      }
      
      const res = await wx.cloud.callFunction({
        name: 'notice',
        data
      });
      
      if (res.result && res.result.success) {
        Toast.success('保存成功');
        setTimeout(() => wx.navigateBack(), 1500);
      } else {
        Toast.fail(res.result?.message || '保存失败');
      }
    } catch (err) {
      console.error('保存公告失败:', err);
      Toast.fail('保存失败');
    } finally {
      this.setData({ loading: false });
    }
  }
});
