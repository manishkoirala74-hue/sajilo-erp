import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { sajilo } from '@/api/sajiloClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { Camera, Loader2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

export default function Profile() {
  const { user, checkUserAuth } = useAuth();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [maxFileSize, setMaxFileSize] = useState(null);
  const [formData, setFormData] = useState({
    full_name: '',
    phone_number: '',
    job_title: '',
    department: '',
    bio: ''
  });

  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordData, setPasswordData] = useState({
    newPassword: '',
    confirmPassword: ''
  });

  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (user && !isInitialized) {
      setFormData({
        full_name: user.full_name || '',
        phone_number: user.phone_number || '',
        job_title: user.job_title || '',
        department: user.department || '',
        bio: user.bio || ''
      });
      setIsInitialized(true);
    }

    async function fetchBucketConfig() {
      try {
        const { data } = await sajilo.auth.supabase.storage.getBucket('avatars');
        if (data && data.file_size_limit) {
          setMaxFileSize(data.file_size_limit);
        }
      } catch (err) {
        console.error("Could not fetch bucket config:", err);
      }
    }
    fetchBucketConfig();
  }, [user]);

  const formatBytes = (bytes) => {
    if (!bytes) return '';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await sajilo.entities.User.update(user.id, formData);
      await checkUserAuth(); // refresh global state
      toast({
        title: "Profile updated",
        description: "Your profile details have been successfully saved."
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error.message || "Failed to update profile.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChangeInput = (e) => {
    const { id, value } = e.target;
    setPasswordData(prev => ({ ...prev, [id === 'new_password' ? 'newPassword' : 'confirmPassword']: value }));
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwordData.newPassword.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match.", variant: "destructive" });
      return;
    }
    setSavingPassword(true);
    try {
      await sajilo.auth.updateUser({ password: passwordData.newPassword });
      toast({ title: "Success", description: "Your password has been changed successfully." });
      setPasswordData({ newPassword: '', confirmPassword: '' });
    } catch (error) {
      toast({ title: "Error", description: error.message || "Failed to change password.", variant: "destructive" });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (maxFileSize && file.size > maxFileSize) {
      toast({
        title: "File too large",
        description: `Please select an image smaller than ${formatBytes(maxFileSize)}.`,
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await sajilo.auth.supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = sajilo.auth.supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const avatarUrl = data.publicUrl;

      // Update User table with new avatar URL
      await sajilo.entities.User.update(user.id, { avatar_url: avatarUrl });
      await checkUserAuth(); // refresh global state
      
      toast({
        title: "Avatar updated",
        description: "Your profile picture has been changed."
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload avatar.",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold">My Profile</h1>
      
      <div className="bg-card rounded-xl p-6 border shadow-sm flex flex-col md:flex-row gap-8 items-start">
        {/* Avatar Section */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-32 h-32 rounded-full overflow-hidden bg-muted flex items-center justify-center border-4 border-background shadow-md">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl font-bold text-muted-foreground">
                {user?.full_name?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            )}
            
            {uploading && (
              <div className="absolute inset-0 bg-background/50 flex items-center justify-center backdrop-blur-sm">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            )}
          </div>
          
          <div className="relative">
            <input 
              type="file" 
              id="avatar" 
              accept="image/*" 
              onChange={handleAvatarUpload}
              disabled={uploading}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <Button variant="outline" size="sm" disabled={uploading}>
              <Camera className="w-4 h-4 mr-2" />
              Change Picture
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            JPG, GIF or PNG. {maxFileSize ? formatBytes(maxFileSize) : '200KB'} max.
          </p>
        </div>

        {/* Form Section */}
        <div className="flex-1 w-full">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name</Label>
                <Input 
                  id="full_name" 
                  name="full_name" 
                  value={formData.full_name} 
                  onChange={handleChange} 
                  placeholder="e.g. John Doe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone_number">Phone Number</Label>
                <Input 
                  id="phone_number" 
                  name="phone_number" 
                  value={formData.phone_number} 
                  onChange={handleChange} 
                  placeholder="+1 234 567 890"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="job_title">Job Title</Label>
                <Input 
                  id="job_title" 
                  name="job_title" 
                  value={formData.job_title} 
                  onChange={handleChange} 
                  placeholder="e.g. Sales Manager"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input 
                  id="department" 
                  name="department" 
                  value={formData.department} 
                  onChange={handleChange} 
                  placeholder="e.g. Sales"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="bio">Bio / Notes</Label>
              <Textarea 
                id="bio" 
                name="bio" 
                value={formData.bio} 
                onChange={handleChange} 
                placeholder="A short description about yourself..."
                rows={3}
              />
            </div>
            
            <div className="pt-4 flex justify-end">
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Security Section */}
      <div className="bg-card rounded-xl p-6 border shadow-sm flex flex-col md:flex-row gap-8 items-start mt-6">
        <div className="w-full">
          <h2 className="text-lg font-semibold mb-4">Security</h2>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new_password">New Password</Label>
                <Input 
                  id="new_password" 
                  type="password" 
                  value={passwordData.newPassword} 
                  onChange={handlePasswordChangeInput} 
                  placeholder="At least 6 characters"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm_password">Confirm New Password</Label>
                <Input 
                  id="confirm_password" 
                  type="password" 
                  value={passwordData.confirmPassword} 
                  onChange={handlePasswordChangeInput} 
                  placeholder="Re-enter new password"
                />
              </div>
            </div>
            <div className="pt-4 flex justify-end">
              <Button type="submit" variant="secondary" disabled={savingPassword}>
                {savingPassword && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Change Password
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
