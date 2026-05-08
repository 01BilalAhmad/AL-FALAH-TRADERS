// Powered by OnSpace.AI
import React, { useEffect, useState, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Linking,
  Dimensions,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { BarChart } from 'react-native-chart-kit';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import { Shop, Transaction, ApiService } from '@/services/api';
import { getShopDisplayBalance } from '@/components/ui/ShopCard';
import { formatPKR, formatDateTime } from '@/utils/format';
import { CreditBar } from './CreditBar';
import { Badge } from './Badge';
import { StorageService, ShopNote } from '@/services/storage';

const screenWidth = Dimensions.get('window').width;

interface ShopDetailModalProps {
  visible: boolean;
  shop: Shop | null;
  companyId?: string;
  onClose: () => void;
  onCollect: () => void;
  hasRecoveryToday?: boolean; // Whether recovery was submitted for this shop today
  onResendReceipt?: () => void; // Callback to resend receipt
}

export const ShopDetailModal = memo(function ShopDetailModal({
  visible,
  shop,
  companyId,
  onClose,
  onCollect,
  hasRecoveryToday,
  onResendReceipt,
}: ShopDetailModalProps) {
  const [recentTxns, setRecentTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [chartData, setChartData] = useState<{ labels: string[]; credits: number[]; recoveries: number[] }>({
    labels: [],
    credits: [],
    recoveries: [],
  });
  const [chartLoading, setChartLoading] = useState(false);
  const [shopNote, setShopNote] = useState<ShopNote | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  // Phone edit state
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [localPhone, setLocalPhone] = useState<string | null>(null);
  const [ownerNameInput, setOwnerNameInput] = useState('');
  const [localOwnerName, setLocalOwnerName] = useState<string | null>(null);

  useEffect(() => {
    if (visible && shop) {
      loadRecent();
      loadChartData();
      loadShopNote();
      setLocalPhone(null);
      setEditingPhone(false);
      setPhoneInput('');
      setOwnerNameInput('');
      setLocalOwnerName(null);
    }
  }, [visible, shop]);

  async function loadRecent() {
    if (!shop) return;
    setLoading(true);
    try {
      const res = await ApiService.getTransactions({ shopId: shop.id, limit: 8 });
      setRecentTxns(res.transactions);
    } catch {
      setRecentTxns([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadChartData() {
    if (!shop) return;
    setChartLoading(true);
    try {
      const now = new Date();
      const labels: string[] = [];
      const credits: number[] = [];
      const recoveries: number[] = [];

      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = d.toLocaleDateString('en-PK', { month: 'short' });
        const startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
        const endD = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        labels.push(label);
        try {
          const res = await ApiService.getTransactions({ shopId: shop.id, date: startDate, limit: 500 });
          const endDateStr = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`;
          const monthTxns = res.transactions.filter((t) => {
            const tDate = t.createdAt.split('T')[0];
            return tDate >= startDate && tDate <= endDateStr;
          });
          const c = monthTxns.filter((t) => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
          const r = monthTxns.filter((t) => t.type === 'recovery').reduce((s, t) => s + t.amount, 0);
          credits.push(c);
          recoveries.push(r);
        } catch {
          credits.push(0);
          recoveries.push(0);
        }
      }
      setChartData({ labels, credits, recoveries });
    } catch {
      setChartData({ labels: [], credits: [], recoveries: [] });
    } finally {
      setChartLoading(false);
    }
  }

  async function loadShopNote() {
    if (!shop) return;
    try {
      const note = await StorageService.getShopNote(shop.id);
      setShopNote(note);
      setNoteInput(note ? note.note : '');
    } catch {
      setShopNote(null);
      setNoteInput('');
    }
  }

  async function handleSaveNote() {
    if (!shop) return;
    setNoteSaving(true);
    try {
      await StorageService.saveShopNote(shop.id, noteInput.trim());
      await loadShopNote();
    } catch {
      Alert.alert('Error', 'Could not save note.');
    } finally {
      setNoteSaving(false);
    }
  }

  async function handleDeleteNote() {
    if (!shop) return;
    Alert.alert('Delete Note', 'Are you sure you want to delete this note?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await StorageService.deleteShopNote(shop.id);
            setShopNote(null);
            setNoteInput('');
          } catch { /* not critical */ }
        },
      },
    ]);
  }

  // Current phone: local override or shop prop
  const currentPhone = localPhone ?? shop?.phone ?? '';
  const currentOwnerName = localOwnerName ?? shop?.ownerName ?? '';

  function handleSmsPress() {
    if (!shop) return;
    if (!currentPhone) {
      Alert.alert(
        'No Phone Number',
        "This shop doesn't have a phone number saved.",
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Add Phone Number',
            onPress: () => {
              setPhoneInput('');
              setEditingPhone(true);
            },
          },
        ]
      );
      return;
    }
    const phone = currentPhone.trim().replace(/[^0-9+]/g, '');
    Linking.openURL(`sms:${phone}`);
  }

  function handleWhatsappPress() {
    if (!shop) return;
    if (!currentPhone) {
      Alert.alert(
        'No Phone Number',
        "This shop doesn't have a phone number saved.",
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Add Phone Number',
            onPress: () => {
              setPhoneInput('');
              setEditingPhone(true);
            },
          },
        ]
      );
      return;
    }
    let formattedPhone = currentPhone.trim().replace(/[^0-9]/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = formattedPhone.substring(1);
    }
    if (!formattedPhone.startsWith('92')) {
      formattedPhone = '92' + formattedPhone;
    }
    Linking.openURL(`https://wa.me/${formattedPhone}`);
  }

  async function handleSavePhone() {
    if (!shop) return;
    const trimmed = phoneInput.trim();
    if (!trimmed) {
      Alert.alert('Invalid Phone', 'Please enter a valid phone number.');
      return;
    }
    setPhoneSaving(true);
    try {
      const trimmedOwner = ownerNameInput.trim();
      await ApiService.updateShopPhone(shop.id, trimmed, trimmedOwner || undefined);
      setLocalPhone(trimmed);
      if (trimmedOwner) setLocalOwnerName(trimmedOwner);
      setEditingPhone(false);
      setPhoneInput('');
      setOwnerNameInput('');
      Alert.alert('Updated', 'Phone number and owner name have been updated successfully.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update. Please try again.');
    } finally {
      setPhoneSaving(false);
    }
  }

  function handleEditPhone() {
    setPhoneInput(currentPhone);
    setOwnerNameInput(currentOwnerName);
    setEditingPhone(true);
  }

  if (!shop) return null;

  const { balance: displayBalance, creditLimit: displayCreditLimit } = getShopDisplayBalance(shop, companyId);
  const utilisationPct = displayCreditLimit > 0 ? Math.min((displayBalance / displayCreditLimit) * 100, 100) : 0;
  const isOverLimit = displayBalance > displayCreditLimit;
  const hasChartData = chartData.credits.some((v) => v > 0) || chartData.recoveries.some((v) => v > 0);

  const totalRecovery = chartData.recoveries.reduce((s, v) => s + v, 0);
  const totalCredit = chartData.credits.reduce((s, v) => s + v, 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.container}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.shopIconWrap}>
              <Text style={styles.shopIcon}>{shop.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.shopName} numberOfLines={1}>{shop.name}</Text>
              <Text style={styles.owner}>{currentOwnerName || shop.ownerName}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <MaterialIcons name="close" size={22} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {/* Info chips */}
            <View style={styles.chipRow}>
              {shop.area ? (
                <View style={styles.chip}>
                  <MaterialIcons name="location-on" size={13} color={Colors.textSecondary} />
                  <Text style={styles.chipText}>{shop.area}</Text>
                </View>
              ) : null}
              {shop.routeDays && shop.routeDays.length > 0 ? (
                <View style={[styles.chip, { backgroundColor: Colors.primaryLight }]}>
                  <MaterialIcons name="calendar-today" size={13} color={Colors.primaryDark} />
                  <Text style={[styles.chipText, { color: Colors.primaryDark }]}>
                    {shop.routeDays.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')}
                  </Text>
                </View>
              ) : null}
              {currentPhone ? (
                <View style={styles.phoneChipRow}>
                  <Pressable
                    style={[styles.chip, { backgroundColor: '#EFF6FF' }]}
                    onPress={() => Linking.openURL(`tel:${currentPhone}`)}
                  >
                    <MaterialIcons name="call" size={13} color="#2563EB" />
                    <Text style={[styles.chipText, { color: '#2563EB' }]}>{currentPhone}</Text>
                  </Pressable>
                  <Pressable onPress={handleEditPhone} hitSlop={8} style={styles.phoneEditBtn}>
                    <MaterialIcons name="edit" size={14} color="#2563EB" />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={[styles.chip, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B', borderWidth: 1 }]}
                  onPress={handleEditPhone}
                >
                  <MaterialIcons name="phone-disabled" size={13} color="#D97706" />
                  <Text style={[styles.chipText, { color: '#D97706' }]}>No phone</Text>
                  <MaterialIcons name="add-circle-outline" size={12} color="#D97706" />
                </Pressable>
              )}
              {/* SMS & WhatsApp action chips */}
              <Pressable
                style={[styles.chip, { backgroundColor: '#E0F2FE' }]}
                onPress={handleSmsPress}
              >
                <MaterialIcons name="sms" size={13} color="#0284C7" />
                <Text style={[styles.chipText, { color: '#0284C7' }]}>SMS</Text>
              </Pressable>
              <Pressable
                style={[styles.chip, { backgroundColor: '#DCFCE7' }]}
                onPress={handleWhatsappPress}
              >
                <MaterialIcons name="chat" size={13} color="#16A34A" />
                <Text style={[styles.chipText, { color: '#16A34A' }]}>WhatsApp</Text>
              </Pressable>
            </View>

            {/* Balance + Credit cards */}
            <View style={styles.balanceRow}>
              <View style={styles.balanceCard}>
                <View style={[styles.balanceIconWrap, { backgroundColor: Colors.dangerLight }]}>
                  <MaterialIcons name="account-balance-wallet" size={20} color={Colors.danger} />
                </View>
                <Text style={styles.balanceLabel}>Outstanding</Text>
                <Text style={[styles.balanceValue, { color: Colors.danger }]}>
                  {formatPKR(displayBalance)}
                </Text>
              </View>
              <View style={styles.balanceDivider} />
              <View style={styles.balanceCard}>
                <View style={[styles.balanceIconWrap, { backgroundColor: '#EFF6FF' }]}>
                  <MaterialIcons name="credit-card" size={20} color="#2563EB" />
                </View>
                <Text style={styles.balanceLabel}>Credit Limit</Text>
                <Text style={[styles.balanceValue, { color: '#2563EB' }]}>
                  {formatPKR(displayCreditLimit)}
                </Text>
              </View>
            </View>

            {/* Credit utilisation */}
            <View style={styles.utilisationCard}>
              <View style={styles.utilisationHeader}>
                <Text style={styles.utilisationLabel}>Credit Utilisation</Text>
                <Text style={[styles.utilisationPct, { color: isOverLimit ? Colors.danger : utilisationPct > 80 ? Colors.secondary : Colors.primary }]}>
                  {utilisationPct.toFixed(0)}%
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${utilisationPct}%`,
                      backgroundColor: isOverLimit ? Colors.danger : utilisationPct > 80 ? Colors.secondary : Colors.primary,
                    },
                  ]}
                />
              </View>
              {isOverLimit ? (
                <View style={styles.overLimitRow}>
                  <MaterialIcons name="warning" size={14} color={Colors.danger} />
                  <Text style={styles.overLimitText}>Over Credit Limit by {formatPKR(displayBalance - displayCreditLimit)}</Text>
                </View>
              ) : null}
            </View>

            {/* 6-Month Performance Chart */}
            <View style={styles.chartCard}>
              <View style={styles.chartTitleRow}>
                <View>
                  <Text style={styles.sectionTitle}>6-Month Performance</Text>
                  <Text style={styles.chartSubtitle}>Credit vs Recovery trend</Text>
                </View>
                <View style={styles.chartLegend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: Colors.secondary }]} />
                    <Text style={styles.legendText}>Credit</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: Colors.primary }]} />
                    <Text style={styles.legendText}>Recovery</Text>
                  </View>
                </View>
              </View>

              {/* Summary pills */}
              <View style={styles.chartPills}>
                <View style={[styles.chartPill, { backgroundColor: Colors.secondaryLight }]}>
                  <Text style={styles.chartPillLabel}>Total Credit</Text>
                  <Text style={[styles.chartPillValue, { color: Colors.secondary }]}>{formatPKR(totalCredit)}</Text>
                </View>
                <View style={[styles.chartPill, { backgroundColor: Colors.primaryLight }]}>
                  <Text style={styles.chartPillLabel}>Total Recovery</Text>
                  <Text style={[styles.chartPillValue, { color: Colors.primary }]}>{formatPKR(totalRecovery)}</Text>
                </View>
              </View>

              {chartLoading ? (
                <View style={styles.chartLoading}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.chartLoadingText}>Loading chart...</Text>
                </View>
              ) : !hasChartData ? (
                <View style={styles.chartEmpty}>
                  <Text style={styles.chartEmptyIcon}>📊</Text>
                  <Text style={styles.chartEmptyText}>No transaction history available</Text>
                </View>
              ) : (
                <BarChart
                  data={{
                    labels: chartData.labels,
                    datasets: [
                      {
                        data: chartData.recoveries.map((v) => Math.max(v, 0)),
                        color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`,
                      },
                    ],
                  }}
                  width={screenWidth - 80}
                  height={150}
                  yAxisLabel="Rs."
                  yAxisSuffix=""
                  chartConfig={{
                    backgroundColor: Colors.surface,
                    backgroundGradientFrom: Colors.surface,
                    backgroundGradientTo: Colors.surface,
                    decimalPlaces: 0,
                    color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`,
                    labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
                    barPercentage: 0.7,
                    propsForBackgroundLines: {
                      stroke: Colors.borderLight,
                    },
                  }}
                  style={{ borderRadius: Radius.md, marginLeft: -Spacing.md }}
                  showValuesOnTopOfBars={false}
                  withInnerLines
                  fromZero
                />
              )}
            </View>

            {/* Recent transactions */}
            <Text style={styles.sectionTitle}>Recent Transactions</Text>

            {/* Notes Section */}
            <View style={styles.notesSection}>
              <View style={styles.notesHeader}>
                <View style={styles.notesHeaderLeft}>
                  <View style={styles.notesIconWrap}>
                    <MaterialIcons name="sticky-note-2" size={16} color={Colors.secondary} />
                  </View>
                  <Text style={styles.sectionTitleInline}>Notes / Remarks</Text>
                </View>
                {shopNote ? (
                  <Pressable onPress={handleDeleteNote} hitSlop={8} style={styles.noteDeleteBtn}>
                    <MaterialIcons name="delete-outline" size={16} color={Colors.danger} />
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.noteInputWrap}>
                <TextInput
                  style={styles.noteTextInput}
                  value={noteInput}
                  onChangeText={setNoteInput}
                  placeholder="Add a note about this shop..."
                  placeholderTextColor={Colors.textMuted}
                  maxLength={500}
                  multiline
                  numberOfLines={3}
                />
              </View>
              <View style={styles.noteActions}>
                {shopNote ? (
                  <Text style={styles.noteUpdatedAt}>
                    Last updated: {formatDateTime(shopNote.updatedAt)}
                  </Text>
                ) : null}
                <Pressable
                  style={({ pressed }) => [styles.noteSaveBtn, pressed && { opacity: 0.7 }]}
                  onPress={handleSaveNote}
                  disabled={!noteInput.trim() || noteSaving}
                >
                  {noteSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <MaterialIcons name="save" size={14} color="#FFFFFF" />
                  )}
                  <Text style={styles.noteSaveBtnText}>
                    {noteSaving ? 'Saving...' : shopNote ? 'Update' : 'Save Note'}
                  </Text>
                </Pressable>
              </View>
            </View>
            {loading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.md }} />
            ) : recentTxns.length === 0 ? (
              <View style={styles.emptyTxnWrap}>
                <MaterialIcons name="receipt-long" size={36} color={Colors.textMuted} />
                <Text style={styles.emptyTxn}>No transactions found</Text>
              </View>
            ) : (
              recentTxns.map((txn) => (
                <View key={txn.id} style={styles.txnRow}>
                  <View style={[
                    styles.txnTypeIcon,
                    { backgroundColor: txn.type === 'credit' ? Colors.secondaryLight : Colors.primaryLight },
                  ]}>
                    <MaterialIcons
                      name={txn.type === 'credit' ? 'arrow-downward' : 'arrow-upward'}
                      size={14}
                      color={txn.type === 'credit' ? Colors.secondary : Colors.primary}
                    />
                  </View>
                  <View style={styles.txnInfo}>
                    <View style={styles.txnInfoTop}>
                      <Text style={styles.txnType}>{txn.type === 'credit' ? 'Credit' : 'Recovery'}</Text>
                      {txn.status === 'pending' ? (
                        <Badge label="Pending" bgColor="#FEF3C7" color="#92400E" size="sm" />
                      ) : txn.status === 'rejected' ? (
                        <Badge label="Rejected" bgColor={Colors.dangerLight} color={Colors.danger} size="sm" />
                      ) : null}
                    </View>
                    <Text style={styles.txnDate}>{formatDateTime(txn.createdAt)}</Text>
                    {txn.description ? (
                      <Text style={styles.txnDesc} numberOfLines={1}>{txn.description}</Text>
                    ) : null}
                  </View>
                  <View style={styles.txnAmountCol}>
                    <Text style={[styles.txnAmount, { color: txn.type === 'credit' ? Colors.secondary : Colors.primary }]}>
                      {formatPKR(txn.amount)}
                    </Text>
                    <Text style={styles.txnBalAfter}>{formatPKR(txn.newBalance)}</Text>
                  </View>
                </View>
              ))
            )}

            <View style={{ height: Spacing.sm }} />
          </ScrollView>

          {/* Collect button / Resend Receipt */}
          <View style={styles.footer}>
            {/* Always show Resend if shop has phone and recovery was done today */}
            {onResendReceipt && currentPhone ? (
              <View style={styles.footerButtonsRow}>
                <Pressable
                  style={({ pressed }) => [styles.collectBtn, { flex: 1 }, pressed && styles.collectBtnPressed]}
                  onPress={() => { onClose(); onCollect(); }}
                >
                  <MaterialIcons name="payments" size={20} color={Colors.textInverse} />
                  <Text style={styles.collectBtnText}>Collect</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.resendBtn, pressed && styles.collectBtnPressed]}
                  onPress={onResendReceipt}
                >
                  <MaterialIcons name="chat" size={20} color="#FFFFFF" />
                  <Text style={styles.collectBtnText}>Resend Receipt</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.collectBtn, pressed && styles.collectBtnPressed]}
                onPress={() => { onClose(); onCollect(); }}
              >
                <MaterialIcons name="payments" size={20} color={Colors.textInverse} />
                <Text style={styles.collectBtnText}>Collect Recovery</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Phone Edit Modal */}
        <Modal visible={editingPhone} transparent animationType="fade">
          <KeyboardAvoidingView
            style={styles.phoneEditBackdrop}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.phoneEditCard}>
              <View style={styles.phoneEditHeader}>
                <View style={styles.phoneEditIconWrap}>
                  <MaterialIcons name="phone" size={22} color="#2563EB" />
                </View>
                <Text style={styles.phoneEditTitle}>Edit Phone & Owner</Text>
                <Text style={styles.phoneEditSubtitle}>{shop.name}</Text>
              </View>
              {/* Owner Name Input */}
              <View style={styles.phoneEditInputWrap}>
                <MaterialIcons name="person" size={18} color={Colors.textMuted} />
                <TextInput
                  style={styles.phoneEditInput}
                  value={ownerNameInput}
                  onChangeText={setOwnerNameInput}
                  placeholder="Owner Name (e.g. Muhammad Ali)"
                  placeholderTextColor={Colors.textMuted}
                  maxLength={50}
                />
                {ownerNameInput ? (
                  <Pressable onPress={() => setOwnerNameInput('')} hitSlop={8}>
                    <MaterialIcons name="cancel" size={16} color={Colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
              {/* Phone Input */}
              <View style={styles.phoneEditInputWrap}>
                <MaterialIcons name="call" size={18} color={Colors.textMuted} />
                <TextInput
                  style={styles.phoneEditInput}
                  value={phoneInput}
                  onChangeText={setPhoneInput}
                  placeholder="e.g. 03001234567"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="phone-pad"
                  maxLength={15}
                  autoFocus
                />
                {phoneInput ? (
                  <Pressable onPress={() => setPhoneInput('')} hitSlop={8}>
                    <MaterialIcons name="cancel" size={16} color={Colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.phoneEditActions}>
                <Pressable
                  style={({ pressed }) => [styles.phoneEditCancelBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => { setEditingPhone(false); setPhoneInput(''); }}
                  disabled={phoneSaving}
                >
                  <Text style={styles.phoneEditCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.phoneEditSaveBtn,
                    (!phoneInput.trim() || phoneSaving) && styles.phoneEditSaveBtnDisabled,
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={handleSavePhone}
                  disabled={!phoneInput.trim() || phoneSaving}
                >
                  {phoneSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <MaterialIcons name="check" size={16} color="#FFFFFF" />
                  )}
                  <Text style={styles.phoneEditSaveText}>
                    {phoneSaving ? 'Saving...' : 'Save'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: Spacing.sm,
    maxHeight: '92%',
    ...Shadow.lg,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  shopIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopIcon: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.primaryDark,
  },
  headerInfo: {
    flex: 1,
  },
  shopName: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  owner: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    padding: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.background,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  chipText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  balanceRow: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  balanceCard: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  balanceDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
  },
  balanceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  balanceLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: FontWeight.medium,
  },
  balanceValue: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  utilisationCard: {
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  utilisationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  utilisationLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  utilisationPct: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  progressTrack: {
    height: 10,
    backgroundColor: Colors.border,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: 10,
    borderRadius: Radius.full,
  },
  overLimitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.xs,
  },
  overLimitText: {
    fontSize: FontSize.xs,
    color: Colors.danger,
    fontWeight: FontWeight.semibold,
  },
  chartCard: {
    backgroundColor: Colors.background,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.sm,
    overflow: 'hidden',
  },
  chartTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  chartSubtitle: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 1,
  },
  chartLegend: {
    gap: 4,
    alignItems: 'flex-end',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  chartPills: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  chartPill: {
    flex: 1,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  chartPillLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  chartPillValue: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  chartLoading: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  chartLoadingText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  chartEmpty: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  chartEmptyIcon: {
    fontSize: 28,
  },
  chartEmptyText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  txnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: Spacing.sm,
  },
  txnTypeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txnInfo: {
    flex: 1,
    gap: 2,
  },
  txnInfoTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  txnType: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  txnDate: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  txnDesc: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  txnAmountCol: {
    alignItems: 'flex-end',
  },
  txnAmount: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  txnBalAfter: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 1,
  },
  emptyTxnWrap: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.xs,
  },
  emptyTxn: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  footer: {
    padding: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  collectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 16,
  },
  collectBtnPressed: { opacity: 0.85 },
  footerButtonsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  resendBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: '#25D366',
    borderRadius: Radius.md,
    paddingVertical: 16,
  },
  collectBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
  },
  // Notes section
  notesSection: {
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  notesHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  notesIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitleInline: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  noteDeleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteInputWrap: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  noteTextInput: {
    fontSize: FontSize.sm,
    color: Colors.text,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  noteActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noteUpdatedAt: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    flex: 1,
  },
  noteSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.secondary,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  noteSaveBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  // Phone chip row & edit
  phoneChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  phoneEditBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Phone Edit Modal styles
  phoneEditBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  phoneEditCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    width: '100%',
    maxWidth: 380,
    ...Shadow.xl,
  },
  phoneEditHeader: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  phoneEditIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  phoneEditTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  phoneEditSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  phoneEditInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  phoneEditInput: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
    paddingVertical: 12,
  },
  phoneEditActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  phoneEditCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  phoneEditCancelText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  phoneEditSaveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 14,
    borderRadius: Radius.md,
    backgroundColor: '#2563EB',
  },
  phoneEditSaveBtnDisabled: {
    opacity: 0.5,
  },
  phoneEditSaveText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
});
