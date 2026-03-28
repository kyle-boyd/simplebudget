import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
} from 'firebase/auth';
import { ref, remove } from 'firebase/database';
import { Building2, RefreshCw, Loader2, Link, Trash2, AlertTriangle, X } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useTransactions } from '@/hooks/useTransactions';
import { useBankAccounts, BankAccount } from '@/hooks/useBankAccounts';
import { useTellerConnect, TellerAuthorization } from '@/hooks/useTellerConnect';
import { db } from '@/lib/firebase';

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD ($)' },
  { value: 'EUR', label: 'EUR (€)' },
  { value: 'GBP', label: 'GBP (£)' },
  { value: 'CAD', label: 'CAD (C$)' },
  { value: 'AUD', label: 'AUD (A$)' },
  { value: 'JPY', label: 'JPY (¥)' },
];

const DATE_FORMAT_OPTIONS = [
  { value: 'MM/DD/YY', label: 'MM/DD/YY' },
  { value: 'DD/MM/YY', label: 'DD/MM/YY' },
  { value: 'YY/MM/DD', label: 'YY/MM/DD' },
];

function Message({
  message,
  isError,
  className,
}: {
  message: string;
  isError: boolean;
  className?: string;
}) {
  if (!message) return null;
  return (
    <span
      className={
        className +
        (isError ? ' text-destructive' : ' text-green-600 dark:text-green-400')
      }
    >
      {message}
    </span>
  );
}

export function Settings() {
  const { user } = useAuth();
  const { settings, loading: settingsLoading, updateSettings } = useUserSettings(user?.uid ?? null);
  const navigate = useNavigate();

  // Preferences
  const [currency, setCurrency] = useState('USD');
  const [dateFormat, setDateFormat] = useState('MM/DD/YY');
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferencesMsg, setPreferencesMsg] = useState('');
  const [preferencesError, setPreferencesError] = useState(false);

  // Account
  const [displayName, setDisplayName] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [profileError, setProfileError] = useState(false);

  // Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  // Bank accounts
  const { addTransactions, deleteTransactionsByAccount } = useTransactions(user?.uid ?? null);
  const { bankAccounts, connectAccounts, syncTransactions, removeAccount } = useBankAccounts(user?.uid ?? null);
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<BankAccount | null>(null);
  const [deleteAccountTransactions, setDeleteAccountTransactions] = useState(false);

  const handleTellerSuccess = async (authorization: TellerAuthorization) => {
    try {
      await connectAccounts(authorization);
    } catch {
      setSyncError('Failed to connect bank account. Please try again.');
    }
  };

  const { open: openTellerConnect } = useTellerConnect({
    onSuccess: handleTellerSuccess,
    onFailure: () => setSyncError('Bank connection failed. Please try again.'),
  });

  const handleSyncAccount = async (account: BankAccount) => {
    setSyncingAccountId(account.id);
    setSyncError(null);
    try {
      const newTransactions = await syncTransactions(account);
      await addTransactions(newTransactions);
    } catch {
      setSyncError(`Failed to sync ${account.name}. Please try again.`);
    } finally {
      setSyncingAccountId(null);
    }
  };

  // Delete account
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteDeleting, setDeleteDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState('');
  const [deleteError, setDeleteError] = useState(false);

  useEffect(() => {
    if (settings.currency) setCurrency(settings.currency);
    if (settings.dateFormat) setDateFormat(settings.dateFormat);
  }, [settings.currency, settings.dateFormat]);

  useEffect(() => {
    const name = user?.displayName ?? settings.displayName ?? '';
    setDisplayName(name);
  }, [user?.displayName, settings.displayName]);

  const handleSavePreferences = async () => {
    if (!user?.uid) return;
    setPreferencesSaving(true);
    setPreferencesMsg('');
    setPreferencesError(false);
    try {
      await updateSettings({ currency, dateFormat });
      setPreferencesMsg('Preferences saved');
      setPreferencesError(false);
      setTimeout(() => setPreferencesMsg(''), 3000);
    } catch (err: unknown) {
      setPreferencesMsg(err instanceof Error ? err.message : 'Failed to save');
      setPreferencesError(true);
    } finally {
      setPreferencesSaving(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    const trimmed = displayName.trim();
    if (!trimmed) {
      setProfileMsg('Name cannot be empty');
      setProfileError(true);
      return;
    }
    setProfileSaving(true);
    setProfileMsg('');
    setProfileError(false);
    try {
      await updateProfile(user, { displayName: trimmed });
      await updateSettings({ displayName: trimmed });
      setProfileMsg('Profile saved');
      setProfileError(false);
      setTimeout(() => setProfileMsg(''), 3000);
    } catch (err: unknown) {
      setProfileMsg(err instanceof Error ? err.message : 'Failed to save');
      setProfileError(true);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user?.email) return;
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordMsg('All password fields are required');
      setPasswordError(true);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg('New passwords do not match');
      setPasswordError(true);
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMsg('Password must be at least 6 characters');
      setPasswordError(true);
      return;
    }
    setPasswordSaving(true);
    setPasswordMsg('');
    setPasswordError(false);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setPasswordMsg('Password changed successfully');
      setPasswordError(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordMsg(''), 3000);
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'auth/wrong-password'
        ? 'Current password is incorrect'
        : (err instanceof Error ? err.message : 'Failed to change password');
      setPasswordMsg(message);
      setPasswordError(true);
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!user?.uid || !user.email) return;
    if (!deletePassword) {
      setDeleteMsg('Password is required to delete your account');
      setDeleteError(true);
      return;
    }
    setDeleteDeleting(true);
    setDeleteMsg('');
    setDeleteError(false);
    try {
      const credential = EmailAuthProvider.credential(user.email, deletePassword);
      await reauthenticateWithCredential(user, credential);
      const userRef = ref(db, `users/${user.uid}`);
      await remove(userRef);
      await deleteUser(user);
      setDeleteDialogOpen(false);
      navigate('/login', { replace: true });
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'auth/wrong-password'
          ? 'Incorrect password'
          : (err instanceof Error ? err.message : 'Failed to delete account');
      setDeleteMsg(message);
      setDeleteError(true);
    } finally {
      setDeleteDeleting(false);
    }
  };

  if (settingsLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">Loading...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8 py-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage your preferences and account.</p>
        </div>

        {/* Account Connections */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Account Connections
            </CardTitle>
            <CardDescription>Manage your connected bank accounts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {syncError && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="flex-1">{syncError}</span>
                <button onClick={() => setSyncError(null)} className="shrink-0">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {bankAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No accounts connected yet.</p>
            ) : (
              <div className="space-y-2">
                {bankAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between rounded-md border px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{account.institutionName}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {account.name} · {account.subtype}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {account.lastSyncAt
                          ? `Last synced ${new Date(account.lastSyncAt).toLocaleString()}`
                          : 'Never synced'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSyncAccount(account)}
                        disabled={syncingAccountId === account.id}
                      >
                        {syncingAccountId === account.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        <span className="ml-1.5">Sync</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                        onClick={() => {
                          setAccountToDelete(account);
                          setDeleteAccountTransactions(false);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Button onClick={openTellerConnect} variant="outline">
              <Link className="h-4 w-4 mr-2" />
              Connect Account
            </Button>
          </CardContent>
        </Card>

        {/* Preferences */}
        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
            <CardDescription>Currency and date format for your budget.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="currency">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateFormat">Date Format</Label>
              <Select value={dateFormat} onValueChange={setDateFormat}>
                <SelectTrigger id="dateFormat">
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent>
                  {DATE_FORMAT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={handleSavePreferences} disabled={preferencesSaving}>
                {preferencesSaving ? 'Saving...' : 'Save Preferences'}
              </Button>
              <Message
                message={preferencesMsg}
                isError={preferencesError}
                className="text-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Account */}
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Your display name and email.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={user?.email ?? ''}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={handleSaveProfile} disabled={profileSaving}>
                {profileSaving ? 'Saving...' : 'Save Profile'}
              </Button>
              <Message message={profileMsg} isError={profileError} className="text-sm" />
            </div>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>Update your password. You will need your current password.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={handleChangePassword} disabled={passwordSaving}>
                {passwordSaving ? 'Updating...' : 'Change Password'}
              </Button>
              <Message message={passwordMsg} isError={passwordError} className="text-sm" />
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Permanently delete your account and all associated data. This action cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={() => {
                setDeleteDialogOpen(true);
                setDeletePassword('');
                setDeleteMsg('');
                setDeleteError(false);
              }}
            >
              Delete Account
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Remove Bank Account Dialog */}
      <Dialog open={!!accountToDelete} onOpenChange={(open) => { if (!open) setAccountToDelete(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Remove Account
            </DialogTitle>
            <DialogDescription>
              Remove <strong>{accountToDelete?.institutionName}</strong> ({accountToDelete?.name})?
              This will disconnect it from syncing.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                id="delete-account-transactions"
                checked={deleteAccountTransactions}
                onCheckedChange={(checked) => setDeleteAccountTransactions(!!checked)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium">Also delete synced transactions</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Remove all transactions imported from this account
                </p>
              </div>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccountToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!accountToDelete) return;
                if (deleteAccountTransactions) {
                  await deleteTransactionsByAccount(accountToDelete.id);
                }
                await removeAccount(accountToDelete.id);
                setAccountToDelete(null);
              }}
            >
              Remove Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>
              This will permanently delete your account and all your data (transactions, categories,
              and settings). This action cannot be undone. Enter your password to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="deletePassword">Your password</Label>
            <Input
              id="deletePassword"
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Your password"
            />
            <Message message={deleteMsg} isError={deleteError} className="text-sm" />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleteDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteDeleting}
            >
              {deleteDeleting ? 'Deleting...' : 'Delete Account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
