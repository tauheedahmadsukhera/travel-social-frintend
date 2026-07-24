import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, TouchableOpacity, View } from 'react-native';

interface CustomInputProps extends TextInputProps {
	label?: string;
	error?: string;
	isPassword?: boolean;
	leftIcon?: keyof typeof Ionicons.glyphMap;
}

export default function CustomInput({
	label,
	error,
	isPassword = false,
	leftIcon,
	style,
	...props
}: CustomInputProps) {
	const [showPassword, setShowPassword] = useState(false);

	return (
		<View style={styles.container}>
			{label && <Text style={styles.label}>{label}</Text>}
			<View style={[styles.inputContainer, error && styles.inputError]}>
				{leftIcon && (
					<Ionicons name={leftIcon} size={20} color="#999" style={styles.leftIcon} />
				)}
				<TextInput
					style={[styles.input, leftIcon && styles.inputWithIcon, style]}
					placeholderTextColor="#999"
					secureTextEntry={isPassword && !showPassword}
					{...props}
				/>
				{isPassword && (
					<TouchableOpacity
						onPress={() => setShowPassword(!showPassword)}
						style={styles.eyeIcon}
					>
						<Ionicons
							name={showPassword ? 'eye-outline' : 'eye-off-outline'}
							size={20}
							color="#999"
						/>
					</TouchableOpacity>
				)}
			</View>
			{error && <Text style={styles.errorText}>{error}</Text>}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		marginBottom: 16,
	},
	label: {
		fontSize: 14,
		fontWeight: '600',
		color: '#000',
	},
	inputContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		borderWidth: 1,
		borderColor: '#e0e0e0',
		borderRadius: 8,
		paddingHorizontal: 12,
		backgroundColor: '#fafafa',
	},
	input: {
		flex: 1,
		height: 48,
		fontSize: 16,
		color: '#222',
	},
	inputWithIcon: {
		marginLeft: 8,
	},
	leftIcon: {
		marginRight: 8,
	},
	eyeIcon: {
		marginLeft: 8,
	},
	inputError: {
		borderColor: '#e74c3c',
	},
	errorText: {
		color: '#e74c3c',
		fontSize: 12,
		marginTop: 4,
	},
});
