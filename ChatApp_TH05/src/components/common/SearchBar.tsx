import React from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useApp } from '../../context/AppContext';
import { Spacing, FontSize, BorderRadius } from '../../theme';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export const SearchBar: React.FC<Props> = ({
  value,
  onChangeText,
  placeholder,
}) => {
  const { theme } = useApp();

  return (
    <View style={[styles.container, { paddingHorizontal: Spacing.lg }]}>
      <View
        style={[
          styles.searchWrapper,
          {
            backgroundColor: theme.inputBackground,
            borderColor: theme.border,
          },
        ]}
      >
        <Icon
          name="search-outline"
          size={18}
          color={theme.textMuted}
          style={styles.icon}
        />
        <TextInput
          style={[styles.input, { color: theme.text }]}
          placeholder={placeholder || 'Tìm kiếm...'}
          placeholderTextColor={theme.textMuted}
          value={value}
          onChangeText={onChangeText}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {value.length > 0 && (
          <TouchableOpacity
            onPress={() => onChangeText('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="close-circle" size={18} color={theme.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: Spacing.sm,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    borderRadius: BorderRadius.round,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
  },
  icon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: FontSize.sm,
    paddingVertical: 0,
  },
});
