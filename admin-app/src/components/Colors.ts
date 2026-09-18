export const Colors = {
  primary: '#3182F6',
  primaryLight: '#EBF4FF',
  danger: '#E03131',
  dangerLight: '#FFF5F5',
  warning: '#F59E0B',
  warningLight: '#FFFBEB',
  success: '#16A34A',
  successLight: '#F0FFF4',
  text: '#191F28',
  textSecondary: '#8B95A1',
  textMuted: '#ADB5BD',
  border: '#F2F4F6',
  white: '#FFFFFF',
  background: '#F8F9FA',
};

export const getRiskColor = (level: string): string => {
  switch (level) {
    case 'danger':
    case 'critical': return Colors.danger;
    case 'warning': return Colors.warning;
    case 'moderate':
    case 'normal': return Colors.primary;
    case 'safe': return Colors.success;
    default: return Colors.textSecondary;
  }
};

export const getRiskBackground = (level: string): string => {
  switch (level) {
    case 'danger':
    case 'critical': return Colors.dangerLight;
    case 'warning': return Colors.warningLight;
    case 'safe': return Colors.successLight;
    default: return Colors.primaryLight;
  }
};

export const getRiskText = (level: string): string => {
  switch (level) {
    case 'danger':
    case 'critical': return '위험';
    case 'warning': return '주의';
    case 'moderate': return '보통';
    case 'safe': return '안전';
    default: return '알 수 없음';
  }
};
