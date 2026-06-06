import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TextStyle, TouchableOpacity, ViewStyle, View } from 'react-native';

interface CustomButtonProps {
	title: string;
	onPress: () => void;
	variant?: 'primary' | 'secondary' | 'outline';
	loading?: boolean;
	disabled?: boolean;
	style?: ViewStyle;
	textStyle?: TextStyle;
	testID?: string;
	icon?: keyof typeof Ionicons.glyphMap;
	iconColor?: string;
}

export default function CustomButton({
	title,
	onPress,
	variant = 'primary',
	loading = false,
	disabled = false,
	style,
	textStyle,
	testID,
	icon,
	iconColor,
}: CustomButtonProps) {
	const getButtonStyle = () => {
		switch (variant) {
			case 'primary':
				return styles.primaryButton;
			case 'secondary':
				return styles.secondaryButton;
			case 'outline':
				return styles.outlineButton;
			default:
				return styles.primaryButton;
		}
	};

	const getTextStyle = () => {
		switch (variant) {
			case 'primary':
				return styles.primaryText;
			case 'secondary':
				return styles.secondaryText;
			case 'outline':
				return styles.outlineText;
			default:
				return styles.primaryText;
		}
	};

	const defaultIconColor = variant === 'outline' ? '#000' : (variant === 'secondary' ? '#FF8D00' : '#fff');

	return (
		<TouchableOpacity
			testID={testID}
			style={[
				styles.button,
				getButtonStyle(),
				(disabled || loading) && styles.disabled,
				style,
			]}
			onPress={onPress}
			disabled={disabled || loading}
			activeOpacity={0.8}
		>
			{loading ? (
				<ActivityIndicator color={variant === 'primary' ? '#fff' : (variant === 'secondary' ? '#FF8D00' : '#000')} />
			) : (
				<View style={styles.buttonContent}>
					{icon && (
						<Ionicons
							name={icon}
							size={20}
							color={iconColor || defaultIconColor}
							style={styles.icon}
						/>
					)}
					<Text style={[getTextStyle(), textStyle]}>{title}</Text>
				</View>
			)}
		</TouchableOpacity>
	);
}

const styles = StyleSheet.create({
	button: {
		height: 50,
		borderRadius: 8,
		alignItems: 'center',
		justifyContent: 'center',
		paddingHorizontal: 20,
	},
	buttonContent: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
	},
	icon: {
		marginRight: 10,
	},
	primaryButton: {
		backgroundColor: '#FF8D00',
	},
	secondaryButton: {
		backgroundColor: '#fff',
		borderWidth: 2,
		borderColor: '#FF8D00',
	},
	outlineButton: {
		backgroundColor: 'transparent',
		borderWidth: 1,
		borderColor: '#e0e0e0',
	},
	primaryText: {
		color: '#fff',
		fontSize: 16,
		fontWeight: '600',
	},
	secondaryText: {
		color: '#FF8D00',
		fontSize: 16,
		fontWeight: '600',
	},
	outlineText: {
		color: '#000',
		fontSize: 16,
		fontWeight: '600',
	},
	disabled: {
		opacity: 0.6,
	},
});
