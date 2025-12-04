// components/timetable/settings/TimetableAdminsSection.tsx
'use client';
import { useState, useEffect } from 'react';
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, Search, CheckCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  department: string;
  has_timetable_admin: boolean;
}

export default function TimetableAdminsSection() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [searchQuery, users]);

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users');
      if (!response.ok) throw new Error('Failed to fetch users');
      const data = await response.json();
      
      // Handle both data.data (new format) and direct array (current format)
      const usersArray = Array.isArray(data) ? data : data.data;
      
      if (!usersArray) {
        throw new Error('Invalid response format');
      }
      
      // Filter out admin users (they already have all permissions)
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
      user.email?.toLowerCase().includes(query) ||
      user.department?.toLowerCase().includes(query)
    );
    setFilteredUsers(filtered);
  };

  const toggleTimetableAdmin = async (userId: number, currentStatus: boolean) => {
    setUpdatingUserId(userId);
    try {
      const response = await fetch(`/api/users/timetable-admin/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ has_timetable_admin: !currentStatus }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update user');
      }

      const result = await response.json();

      // Update local state with the actual response data to ensure persistence
      // This ensures the toggle state matches exactly what's in the database
      setUsers(users.map(user =>
        user.id === userId
          ? { ...user, has_timetable_admin: result.user.has_timetable_admin }
          : user
      ));

      toast({
        title: "Success",
        description: result.message,
      });
    } catch (error) {
      console.error('Error updating user:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update user privileges",
        variant: "destructive",
      });
    } finally {
      setUpdatingUserId(null);
    }
  };

  const timetableAdminCount = users.filter(u => u.has_timetable_admin).length;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          Timetable administrators can view, create, edit, and delete all timetable entries, 
          as well as generate timetables. They have full control over the timetable system.
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-sm">
            {timetableAdminCount} Timetable Admin{timetableAdminCount !== 1 ? 's' : ''}
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
              className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900">{user.name}</p>
                  {user.has_timetable_admin && (
                    <Badge variant="default" className="flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Timetable Admin
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-gray-600">{user.email || 'No email'}</p>
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
              </div>

              <div className="flex items-center gap-3">
                {updatingUserId === user.id ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                ) : (
                  <Switch
                    checked={user.has_timetable_admin}
                    onCheckedChange={() => toggleTimetableAdmin(user.id, user.has_timetable_admin)}
                    disabled={updatingUserId === user.id}
                  />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}