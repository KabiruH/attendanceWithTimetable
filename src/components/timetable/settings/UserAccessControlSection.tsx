// components/timetable/settings/UserAccessControlSection.tsx
'use client';
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch"; // Add this import
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Ban, Search, CheckCircle, AlertTriangle, History, Lock } from "lucide-react"; // Add Lock
import { useToast } from "@/components/ui/use-toast";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  department: string;
  is_blocked: boolean;
  blocked_at: string | null;
  blocked_reason: string | null;
  blocked_by: number | null;
}

interface BlockLog {
  id: number;
  action: string;
  reason: string | null;
  created_at: string;
  blocked_by_user: {
    name: string;
  };
}

export default function UserAccessControlSection() {
  const { toast } = useToast();
  
  // Global toggle state
  const [isGlobalBlockEnabled, setIsGlobalBlockEnabled] = useState(false);
  const [isSavingGlobal, setIsSavingGlobal] = useState(false);
  
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [processingUserId, setProcessingUserId] = useState<number | null>(null);

  // Block dialog state
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);
  const [userToBlock, setUserToBlock] = useState<User | null>(null);
  const [blockReason, setBlockReason] = useState('');

  // History dialog state
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [blockHistory, setBlockHistory] = useState<BlockLog[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    fetchGlobalSettings();
    fetchUsers();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [searchQuery, users]);

  // Fetch global block setting
  const fetchGlobalSettings = async () => {
    try {
      const response = await fetch('/api/timetable-settings');
      if (!response.ok) throw new Error('Failed to fetch settings');
      const data = await response.json();
      
      if (data.data) {
        setIsGlobalBlockEnabled(data.data.block_all_subject_selection || false);
      }
    } catch (error) {
      console.error('Error fetching global settings:', error);
    }
  };

  // Save global block setting
  const saveGlobalBlockSetting = async (enabled: boolean) => {
    setIsSavingGlobal(true);
    try {
      const response = await fetch('/api/timetable-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          block_all_subject_selection: enabled,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save settings');
      }

      toast({
        title: "Success",
        description: enabled 
          ? "All users are now blocked from selecting subjects"
          : "Users can now select subjects again",
      });
    } catch (error) {
      console.error('Error saving global block setting:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save settings",
        variant: "destructive",
      });
      // Revert on error
      setIsGlobalBlockEnabled(!enabled);
    } finally {
      setIsSavingGlobal(false);
    }
  };

  const handleGlobalBlockToggle = async (checked: boolean) => {
    setIsGlobalBlockEnabled(checked);
    await saveGlobalBlockSetting(checked);
  };

const fetchUsers = async () => {
  try {
    const response = await fetch('/api/users');
    if (!response.ok) throw new Error('Failed to fetch users');
    const data = await response.json();
    
    // Handle different response formats
    const usersArray = data.data || data || [];
    
    // Filter out admin users
    const nonAdminUsers = usersArray.filter((user: User) => user.role !== 'admin');
    setUsers(nonAdminUsers);
    setFilteredUsers(nonAdminUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    toast({
      title: "Error",
      description: "Failed to load users",
      variant: "destructive",
    });
  } finally {
    setIsLoading(false);
  }
};

  const filterUsers = () => {
    if (!searchQuery.trim()) {
      setFilteredUsers(users);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = users.filter(user =>
      user.name.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query) ||
      user.department?.toLowerCase().includes(query)
    );
    setFilteredUsers(filtered);
  };

  const handleBlockClick = (user: User) => {
    setUserToBlock(user);
    setBlockReason('');
    setIsBlockDialogOpen(true);
  };

  const handleBlockUser = async () => {
    if (!userToBlock) return;

    setProcessingUserId(userToBlock.id);
    try {
      const response = await fetch(`/api/classes/block/${userToBlock.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: blockReason }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to block user');
      }

      const result = await response.json();

      // Update local state
      setUsers(users.map(user =>
        user.id === userToBlock.id
          ? {
              ...user,
              is_blocked: true,
              blocked_at: new Date().toISOString(),
              blocked_reason: blockReason,
            }
          : user
      ));

      toast({
        title: "Success",
        description: result.message,
      });

      setIsBlockDialogOpen(false);
      setUserToBlock(null);
      setBlockReason('');
    } catch (error) {
      console.error('Error blocking user:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to block user",
        variant: "destructive",
      });
    } finally {
      setProcessingUserId(null);
    }
  };

  const handleUnblockUser = async (user: User) => {
    setProcessingUserId(user.id);
    try {
      const response = await fetch(`/api/classes/unblock/${user.id}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to unblock user');
      }

      const result = await response.json();

      // Update local state
      setUsers(users.map(u =>
        u.id === user.id
          ? {
              ...u,
              is_blocked: false,
              blocked_at: null,
              blocked_reason: null,
              blocked_by: null,
            }
          : u
      ));

      toast({
        title: "Success",
        description: result.message,
      });
    } catch (error) {
      console.error('Error unblocking user:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to unblock user",
        variant: "destructive",
      });
    } finally {
      setProcessingUserId(null);
    }
  };



  const blockedUserCount = users.filter(u => u.is_blocked).length;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Global Block Toggle - NEW */}
      <div className="border rounded-lg p-4 bg-gradient-to-r from-red-50 to-orange-50">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-red-600" />
              <Label htmlFor="global-block" className="text-base font-semibold text-red-900">
                Block All Subject Selection
              </Label>
            </div>
            <p className="text-sm text-red-800">
              When enabled, <strong>all users</strong> will be blocked from selecting classes and subjects.
              Use this during deadlines or when assignments are being finalized.
            </p>
            {isGlobalBlockEnabled && (
              <Alert variant="destructive" className="mt-3">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Active:</strong> All users are currently blocked from making subject selections.
                </AlertDescription>
              </Alert>
            )}
          </div>
          <Switch
            id="global-block"
            checked={isGlobalBlockEnabled}
            onCheckedChange={handleGlobalBlockToggle}
            disabled={isSavingGlobal}
            className="data-[state=checked]:bg-red-600"
          />
        </div>
      </div>

      <hr />

      {/* Individual User Blocking Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-1">Individual User Blocking</h3>
          <p className="text-sm text-gray-600">
            Block specific users from selecting classes and subjects independently of the global setting.
          </p>
        </div>

        <Alert>
          <Ban className="h-4 w-4" />
          <AlertDescription>
            Individually blocked users cannot select classes or subjects even when the global block is disabled.
            They can still view their timetable but cannot make any changes.
          </AlertDescription>
        </Alert>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="destructive" className="text-sm">
              {blockedUserCount} Blocked User{blockedUserCount !== 1 ? 's' : ''}
            </Badge>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="border rounded-lg divide-y max-h-[600px] overflow-y-auto">
          {filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No users found
            </div>
          ) : (
            filteredUsers.map((user) => (
              <div
                key={user.id}
                className={`p-4 transition-colors ${
                  user.is_blocked ? 'bg-red-50' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">{user.name}</p>
                      {user.is_blocked ? (
                        <Badge variant="destructive" className="flex items-center gap-1">
                          <Ban className="h-3 w-3" />
                          Blocked
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-600" />
                          Active
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{user.email}</p>
                    <div className="flex items-center gap-4 mt-1">
                      <p className="text-xs text-gray-500">
                        Role: <span className="font-medium capitalize">{user.role}</span>
                      </p>
                      {user.department && (
                        <p className="text-xs text-gray-500">
                          Department: <span className="font-medium">{user.department}</span>
                        </p>
                      )}
                    </div>

                    {user.is_blocked && user.blocked_reason && (
                      <div className="mt-2 p-2 bg-red-100 rounded text-xs text-red-800">
                        <p className="font-medium">Reason: {user.blocked_reason}</p>
                        {user.blocked_at && (
                          <p className="text-red-600 mt-1">
                            Blocked on: {new Date(user.blocked_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    {processingUserId === user.id ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                    ) : user.is_blocked ? (
                      <>
                        
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleUnblockUser(user)}
                        >
                          Unblock
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleBlockClick(user)}
                      >
                        <Ban className="h-4 w-4 mr-1" />
                        Block
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Dialogs remain the same */}
      {/* Block User Dialog */}
      <Dialog open={isBlockDialogOpen} onOpenChange={setIsBlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Block User Access</DialogTitle>
            <DialogDescription>
              This will prevent the user from selecting classes and subjects.
            </DialogDescription>
          </DialogHeader>

          {userToBlock && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded">
                <p className="font-medium">{userToBlock.name}</p>
                <p className="text-sm text-gray-600">{userToBlock.email}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {userToBlock.department} • {userToBlock.role}
                </p>
              </div>

              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  This user will not be able to:
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Select classes</li>
                    <li>Choose subjects to teach</li>
                    <li>Modify existing assignments</li>
                  </ul>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="block-reason">Reason (Optional)</Label>
                <Textarea
                  id="block-reason"
                  placeholder="e.g., Pending contract renewal, Administrative review..."
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsBlockDialogOpen(false);
                setUserToBlock(null);
                setBlockReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBlockUser}
              disabled={processingUserId !== null}
            >
              {processingUserId ? 'Blocking...' : 'Block User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block History Dialog */}
      <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Block History</DialogTitle>
            <DialogDescription>
              View the complete history of block and unblock actions for this user.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {loadingHistory ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              </div>
            ) : blockHistory.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No history found
              </div>
            ) : (
              blockHistory.map((log) => (
                <div
                  key={log.id}
                  className={`p-3 border rounded ${
                    log.action === 'blocked' ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium capitalize">
                        {log.action === 'blocked' ? '🔴' : '🟢'} {log.action}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        By: {log.blocked_by_user.name}
                      </p>
                      {log.reason && (
                        <p className="text-sm text-gray-700 mt-1">
                          Reason: {log.reason}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {new Date(log.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsHistoryDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}