import { AppNotification } from '../types';

// Thông báo: tối thiểu 8 mục — GIỮ NGUYÊN theo yêu cầu đề bài
export const mockNotifications: AppNotification[] = [
  {
    id: 'n1',
    title: 'Tin nhắn mới từ Trần Thị Mai',
    message: 'Hẹn gặp bạn ở quán cà phê chiều nay nhé!',
    timestamp: '10:30',
    isRead: false,
    type: 'message',
  },
  {
    id: 'n2',
    title: 'Lời mời kết bạn',
    message: 'Dương Thành Long đã gửi cho bạn một lời mời kết bạn.',
    timestamp: '08:45',
    isRead: false,
    type: 'friend_request',
  },
  {
    id: 'n3',
    title: 'Cập nhật hệ thống',
    message: 'Phiên bản ChatApp 2.0 đã sẵn sàng với nhiều tính năng mới.',
    timestamp: 'Hôm qua',
    isRead: false,
    type: 'system',
  },
  {
    id: 'n4',
    title: 'Tin nhắn mới từ Bùi Tuấn Anh',
    message: 'Mai nhớ mang tài liệu đi sớm nhé.',
    timestamp: 'Hôm qua',
    isRead: true,
    type: 'message',
  },
  {
    id: 'n5',
    title: 'Bảo mật tài khoản',
    message: 'Tài khoản của bạn vừa đăng nhập trên một thiết bị Android mới.',
    timestamp: '2 ngày trước',
    isRead: true,
    type: 'system',
  },
  {
    id: 'n6',
    title: 'Lời mời kết bạn',
    message: 'Phan Gia Bảo đã chấp nhận lời mời kết bạn của bạn.',
    timestamp: '3 ngày trước',
    isRead: true,
    type: 'friend_request',
  },
  {
    id: 'n7',
    title: 'Tin nhắn mới từ Vũ Thảo Linh',
    message: 'Tối nay nhóm mình có họp không?',
    timestamp: 'T2',
    isRead: false,
    type: 'message',
  },
  {
    id: 'n8',
    title: 'Khuyến mãi thành viên mới',
    message: 'Chào mừng bạn đến với ChatApp! Khám phá thêm bạn bè xung quanh.',
    timestamp: 'Tuần trước',
    isRead: true,
    type: 'system',
  },
];
