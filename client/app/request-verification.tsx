import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { 
  Alert, 
  ScrollView, 
  StyleSheet, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  View, 
  ActivityIndicator, 
  Image, 
  Modal, 
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { hapticLight, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useThemeColors } from '@/lib/theme';
import { apiService } from '@/src/services/apiService';
import { uploadMedia } from '@/lib/firebaseHelpers/core';

const CATEGORIES = ['Travel Blogger', 'Influencer', 'Photographer', 'Journalist', 'Business', 'Other'];

export default function RequestVerificationScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  
  // Loading & State
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [requestStatus, setRequestStatus] = useState<any>(null);

  // Form States
  const [fullName, setFullName] = useState('');
  const [category, setCategory] = useState('');
  const [documentUri, setDocumentUri] = useState<string | null>(null);
  
  // UI States
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  useEffect(() => {
    fetchVerificationStatus();
  }, []);

  const fetchVerificationStatus = async () => {
    try {
      setLoading(true);
      const res = await apiService.get('/users/verification/status');
      if (res?.success) {
        setRequestStatus(res.data);
      }
    } catch (err) {
      console.warn('Failed to fetch verification status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePickDocument = async () => {
    hapticLight();
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Denied', 'We need access to your photos to upload an identity document.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setDocumentUri(result.assets[0].uri);
      }
    } catch (err) {
      console.error('Error picking document:', err);
      Alert.alert('Error', 'Failed to pick image.');
    }
  };

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      Alert.alert('Required Field', 'Please enter your legal full name.');
      return;
    }
    if (!category) {
      Alert.alert('Required Field', 'Please select a category.');
      return;
    }
    if (!documentUri) {
      Alert.alert('Required Field', 'Please upload a photo of your identity document.');
      return;
    }

    try {
      setSubmitting(true);
      hapticLight();

      // 1. Upload the image document
      const uploadRes = await uploadMedia(documentUri, 'image', 'verifications');
      if (!uploadRes?.success || !uploadRes?.url) {
        throw new Error('Image upload failed');
      }

      const documentUrl = uploadRes.url;

      // 2. Submit the verification request
      const submitRes = await apiService.post('/users/verification/request', {
        fullName: fullName.trim(),
        category,
        documentUrl,
      });

      if (submitRes?.success) {
        hapticSuccess();
        Alert.alert(
          'Submitted Successfully',
          'Your request is now under review. We will notify you once it has been processed.',
          [{ text: 'OK', onPress: () => fetchVerificationStatus() }]
        );
      } else {
        throw new Error(submitRes?.error || 'Submission failed');
      }
    } catch (err: any) {
      hapticWarning();
      console.error('Submit verification error:', err);
      Alert.alert('Submission Failed', err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApplyAgain = () => {
    hapticLight();
    // Simply reset form states to show blank form
    setRequestStatus(null);
    setFullName('');
    setCategory('');
    setDocumentUri(null);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#FF8D00" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => {
            hapticLight();
            router.back();
          }}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Request Verification</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* State 1: Already Approved */}
        {requestStatus?.status === 'approved' && (
          <View style={styles.stateCard}>
            <View style={[styles.iconCircle, { backgroundColor: '#e0f2fe' }]}>
              <Feather name="shield" size={48} color="#0284c7" />
            </View>
            <Text style={[styles.stateTitle, { color: colors.text }]}>You are Verified!</Text>
            <Text style={[styles.stateDescription, { color: colors.textSecondary }]}>
              Your account has been verified. A blue badge (blue tick) has been added to your profile to let others know you are an authentic public figure or notable entity.
            </Text>
            <View style={[styles.detailsBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Legal Name:</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{requestStatus.fullName}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Category:</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{requestStatus.category}</Text>
              </View>
            </View>
          </View>
        )}

        {/* State 2: Pending Review */}
        {requestStatus?.status === 'pending' && (
          <View style={styles.stateCard}>
            <View style={[styles.iconCircle, { backgroundColor: '#ffedd5' }]}>
              <Feather name="clock" size={48} color="#ea580c" />
            </View>
            <Text style={[styles.stateTitle, { color: colors.text }]}>Request Under Review</Text>
            <Text style={[styles.stateDescription, { color: colors.textSecondary }]}>
              Thank you for applying. Our moderation team is currently reviewing your identity document. We'll update you as soon as a decision is made.
            </Text>
            <View style={[styles.detailsBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Legal Name:</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{requestStatus.fullName}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Category:</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{requestStatus.category}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Status:</Text>
                <Text style={[styles.detailValue, { color: '#ea580c', fontWeight: 'bold' }]}>Pending Admin Review</Text>
              </View>
            </View>
          </View>
        )}

        {/* State 3: Rejected */}
        {requestStatus?.status === 'rejected' && (
          <View style={styles.stateCard}>
            <View style={[styles.iconCircle, { backgroundColor: '#fee2e2' }]}>
              <Feather name="alert-triangle" size={48} color="#dc2626" />
            </View>
            <Text style={[styles.stateTitle, { color: colors.text }]}>Application Rejected</Text>
            <Text style={[styles.stateDescription, { color: colors.textSecondary }]}>
              Unfortunately, your verification application was rejected by the administration.
            </Text>
            
            {requestStatus.rejectionReason ? (
              <View style={[styles.reasonBox, { borderColor: '#fca5a5' }]}>
                <Text style={styles.reasonTitle}>Reason for Rejection:</Text>
                <Text style={styles.reasonText}>{requestStatus.rejectionReason}</Text>
              </View>
            ) : null}

            <TouchableOpacity style={styles.applyAgainBtn} onPress={handleApplyAgain}>
              <Text style={styles.applyAgainBtnText}>Submit New Request</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* State 4: Default Form Screen */}
        {!requestStatus && (
          <View style={styles.formContainer}>
            <Text style={[styles.introText, { color: colors.text }]}>
              Apply for the Trips Verified Badge. Verified accounts have a blue tick next to their names to show that we have confirmed they are authentic.
            </Text>
            
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Legal Full Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                placeholder="As it appears on your passport or national ID"
                placeholderTextColor={colors.textSecondary}
                value={fullName}
                onChangeText={setFullName}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Category</Text>
              <TouchableOpacity 
                style={[styles.selectBox, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => {
                  hapticLight();
                  setShowCategoryModal(true);
                }}
              >
                <Text style={[styles.selectBoxText, { color: category ? colors.text : colors.textSecondary }]}>
                  {category || 'Select a category for your account'}
                </Text>
                <Feather name="chevron-down" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Identity Document</Text>
              <Text style={[styles.subLabel, { color: colors.textSecondary }]}>
                Please upload a clear photo of your official government-issued ID (e.g. Passport, CNIC, Driver's License) showing your full name and face clearly.
              </Text>
              
              {documentUri ? (
                <View style={[styles.documentPreviewContainer, { borderColor: colors.border }]}>
                  <Image source={{ uri: documentUri }} style={styles.documentPreviewImage} />
                  <TouchableOpacity style={styles.removeDocumentBtn} onPress={() => setDocumentUri(null)}>
                    <Feather name="x" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={[styles.uploadBtn, { borderColor: colors.border }]} onPress={handlePickDocument}>
                  <Feather name="camera" size={24} color="#FF8D00" />
                  <Text style={styles.uploadBtnText}>Choose Photo / Select ID File</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity 
              style={[styles.submitBtn, submitting && styles.submitBtnDisabled]} 
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Submit Verification Request</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
        
      </ScrollView>

      {/* Category Selection Modal */}
      <Modal visible={showCategoryModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Account Category</Text>
              <TouchableOpacity onPress={() => setShowCategoryModal(false)}>
                <Feather name="x" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.modalOption, { borderBottomColor: colors.border }]}
                  onPress={() => {
                    hapticLight();
                    setCategory(cat);
                    setShowCategoryModal(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, { color: colors.text, fontWeight: category === cat ? 'bold' : 'normal' }]}>
                    {cat}
                  </Text>
                  {category === cat && <Feather name="check" size={16} color="#FF8D00" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  stateCard: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 10,
  },
  iconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  stateTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'center',
  },
  stateDescription: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  detailsBox: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  reasonBox: {
    width: '100%',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
  },
  reasonTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#991b1b',
    marginBottom: 4,
  },
  reasonText: {
    fontSize: 14,
    color: '#7f1d1d',
    lineHeight: 18,
  },
  applyAgainBtn: {
    backgroundColor: '#FF8D00',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
  },
  applyAgainBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  formContainer: {
    width: '100%',
  },
  introText: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
    fontWeight: '500',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  subLabel: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 10,
  },
  input: {
    height: 50,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  selectBox: {
    height: 50,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  selectBoxText: {
    fontSize: 15,
  },
  uploadBtn: {
    height: 120,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  uploadBtnText: {
    fontSize: 14,
    color: '#FF8D00',
    fontWeight: '600',
  },
  documentPreviewContainer: {
    height: 160,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  documentPreviewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  removeDocumentBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtn: {
    backgroundColor: '#FF8D00',
    height: 50,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  modalOptionText: {
    fontSize: 15,
  },
});
