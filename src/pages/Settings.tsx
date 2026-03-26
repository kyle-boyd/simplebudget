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
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
