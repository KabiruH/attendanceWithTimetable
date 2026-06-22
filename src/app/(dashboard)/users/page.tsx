'use client';
import { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { PlusCircle, Upload, Download, Search, KeyRound } from "lucide-react";
import UsersTable from '@/components/users/users';
import * as XLSX from 'xlsx';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { User } from '@/lib/types/user';

interface Department {
  id: number;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDepartments, setIsLoadingDepartments] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    id_number: '',
    role: '',
    phone_number: '',
    gender: '',
    department: '',
    email: '',
    is_active: true
  });
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deactivatingUser, setDeactivatingUser] = useState<User | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [filterDepartment, setFilterDepartment] = useState<string>('all');

  // Search and pagination states
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const usersPerPage = 50;

  // Password change states
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordTargetUser, setPasswordTargetUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Excel import states
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResults, setImportResults] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
    duplicates: string[];
  } | null>(null);
  const [showDuplicatesDialog, setShowDuplicatesDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchUsers();
    fetchDepartments();
  }, []);

  // Filter users when search query changes
  useEffect(() => {
  let filtered = users;

  if (searchQuery.trim() !== '') {
    const query = searchQuery.toLowerCase();
    filtered = filtered.filter(user =>
      user.name.toLowerCase().includes(query) ||
      user.id_number.toLowerCase().includes(query) ||
      (user.department && user.department.toLowerCase().includes(query))
    );
  }

  if (filterDepartment !== 'all') {
    filtered = filtered.filter(user => user.department === filterDepartment);
  }

  setFilteredUsers(filtered);
  setCurrentPage(1);
}, [searchQuery, filterDepartment, users]);

  // Pagination calculations
  const indexOfLastUser = currentPage * usersPerPage;
  const indexOfFirstUser = indexOfLastUser - usersPerPage;
  const currentUsers = filteredUsers.slice(indexOfFirstUser, indexOfLastUser);
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users');
      if (!response.ok) throw new Error('Failed to fetch users');
      const data = await response.json();
      setUsers(data);
      setFilteredUsers(data);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await fetch('/api/departments');
      if (!response.ok) throw new Error('Failed to fetch departments');
      const data = await response.json();
      setDepartments(data);
    } catch (error) {
      console.error('Error fetching departments:', error);
    } finally {
      setIsLoadingDepartments(false);
    }
  };

  const handleOpenDialog = () => {
    setEditingUser(null);
    setFormData({
      name: '',
      id_number: '',
      role: '',
      phone_number: '',
      gender: '',
      department: '',
      email: '',
      is_active: true
    });
    setError('');
    setIsDialogOpen(true);
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      id_number: user.id_number,
      role: user.role,
      phone_number: user.phone_number,
      gender: user.gender,
      department: user.department || '',
      email: user.email ?? '',
      is_active: user.is_active
    });
    setError('');
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const url = '/api/users';
      const method = editingUser ? 'PUT' : 'POST';
      const body = editingUser ? { ...formData, id: editingUser.id } : formData;
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save user');
      await fetchUsers();
      setIsDialogOpen(false);
      setFormData({
        name: '',
        id_number: '',
        role: '',
        phone_number: '',
        gender: '',
        department: '',
        email: '',
        is_active: true
      });
      setEditingUser(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async (user: User) => {
    setDeactivatingUser(user);
  };

  const confirmDeactivate = async () => {
    if (!deactivatingUser) return;
    setIsDeactivating(true);
    try {
      const response = await fetch(`/api/users/deactivate/${deactivatingUser.id}`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to deactivate user');
      await fetchUsers();
    } catch (error) {
      console.error('Error deactivating user:', error);
    } finally {
      setIsDeactivating(false);
      setDeactivatingUser(null);
    }
  };

  // ── Password change handlers ──────────────────────────────────────────────
  const handleOpenPasswordDialog = (user: User) => {
    setPasswordTargetUser(user);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setPasswordSuccess('');
    setIsPasswordDialogOpen(true);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    setIsChangingPassword(true);
    try {
      const response = await fetch('/api/users/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: passwordTargetUser?.id, newPassword }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to change password');
      setPasswordSuccess(`Password for ${passwordTargetUser?.name} updated successfully.`);
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };
  // ─────────────────────────────────────────────────────────────────────────

  // Excel import handlers
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setImportResults(null);
    setError('');
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      let worksheet;
      const dataSheetIndex = workbook.SheetNames.findIndex(
        name => name.toLowerCase().includes('sample') || name.toLowerCase().includes('data') || name.toLowerCase() === 'users'
      );
      if (dataSheetIndex !== -1) {
        worksheet = workbook.Sheets[workbook.SheetNames[dataSheetIndex]];
      } else {
        worksheet = workbook.Sheets[workbook.SheetNames[workbook.SheetNames.length - 1]];
      }
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      const usersToImport = jsonData
        .filter((row: any) => row.name || row.Name)
        .map((row: any) => {
          const user = {
            name: (row.name || row.Name || '').toString().trim(),
            id_number: (row.id_number || row['ID Number'] || '').toString().trim(),
            role: (row.role || row.Role || '').toString().toLowerCase().trim(),
            phone_number: (row.phone_number || row['Phone Number'] || row.phone || '').toString().trim(),
            gender: (row.gender || row.Gender || '').toString().toLowerCase().trim(),
            department: row.department || row.Department || null,
            email: row.email || row.Email || null,
            is_active: row.is_active === false || row.is_active === 'false' ? false : true
          };
          if (user.department === '') user.department = null;
          if (user.email === '') user.email = null;
          return user;
        });
      if (usersToImport.length === 0) {
        throw new Error('No valid user data found in the Excel file. Please check the format.');
      }
      const response = await fetch('/api/users/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: usersToImport }),
      });
      const result = await response.json();
      if (!response.ok && response.status === 500) {
        throw new Error(result.error || 'Server error occurred while importing users');
      }
      setImportResults({
        imported: result.imported || 0,
        skipped: result.skipped || 0,
        errors: result.errors || [],
        duplicates: result.duplicates || []
      });
      if (result.imported > 0) await fetchUsers();
      if (result.imported === 0 && (result.errors?.length > 0 || result.duplicates?.length > 0)) {
        setError('Import completed with issues. Please review the details below.');
      }
    } catch (error) {
      console.error('Import error:', error);
      setError(error instanceof Error ? error.message : 'Failed to process file');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCloseImportDialog = () => {
    if (importResults && importResults.duplicates.length > 0) {
      setIsImportDialogOpen(false);
      setShowDuplicatesDialog(true);
    } else {
      setIsImportDialogOpen(false);
      setImportResults(null);
      setError('');
    }
  };

  const downloadTemplate = () => {
    const template = [
      {
        name: 'John Doe',
        id_number: '12345678',
        role: 'employee',
        phone_number: '+254712345678',
        gender: 'male',
        department: departments.length > 0 ? departments[0].name : 'Finance',
        email: 'john.doe@example.com',
        is_active: true
      }
    ];
    const departmentInstructions = departments.length > 0
      ? departments.map(dept => ({ Instruction: `  - ${dept.name}` }))
      : [
          { Instruction: '  - Finance' },
          { Instruction: '  - Human Resources' },
          { Instruction: '  - Engineering' }
        ];
    const instructions = [
      { Instruction: 'USERS IMPORT TEMPLATE - INSTRUCTIONS' },
      { Instruction: '' },
      { Instruction: 'Required Fields (must be filled):' },
      { Instruction: '  - name: Full name of the user' },
      { Instruction: '  - id_number: Unique ID or Passport number' },
      { Instruction: '  - role: Must be either "admin" or "employee"' },
      { Instruction: '  - phone_number: Phone number with country code (e.g., +254712345678)' },
      { Instruction: '  - gender: Must be either "male" or "female"' },
      { Instruction: '' },
      { Instruction: 'Optional Fields:' },
      { Instruction: '  - department: User\'s department (max 20 characters)' },
      { Instruction: '  - email: User\'s email address (must be unique if provided)' },
      { Instruction: '  - is_active: Set to true or false (default is true)' },
      { Instruction: '' },
      { Instruction: 'Valid Departments (will be truncated to 20 characters):' },
      ...departmentInstructions,
      { Instruction: '' },
      { Instruction: 'Important Notes:' },
      { Instruction: '  - ID numbers must be unique across all users' },
      { Instruction: '  - Email addresses must be unique if provided' },
      { Instruction: '  - Duplicates will be automatically skipped' },
      { Instruction: '  - Department names longer than 20 characters will be truncated' },
      { Instruction: '  - Delete the sample data rows before importing your actual data' },
      { Instruction: '  - Keep the column headers exactly as shown' },
    ];
    const workbook = XLSX.utils.book_new();
    const instructionsWS = XLSX.utils.json_to_sheet(instructions);
    instructionsWS['!cols'] = [{ wch: 80 }];
    XLSX.utils.book_append_sheet(workbook, instructionsWS, 'Instructions');
    const dataWS = XLSX.utils.json_to_sheet(template);
    dataWS['!cols'] = [
      { wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 18 },
      { wch: 10 }, { wch: 20 }, { wch: 30 }, { wch: 10 }
    ];
    XLSX.utils.book_append_sheet(workbook, dataWS, 'Sample Data');
    XLSX.writeFile(workbook, 'users_import_template.xlsx');
  };

  // Pagination handlers
  const goToNextPage = () => setCurrentPage(prev => Math.min(prev + 1, totalPages));
  const goToPreviousPage = () => setCurrentPage(prev => Math.max(prev - 1, 1));
  const goToPage = (page: number) => setCurrentPage(page);

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxPagesToShow = 5;
    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    return pages;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">User Management</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsImportDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import Excel
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleOpenDialog}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingUser ? 'Edit User' : 'Add New User'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="id_number">ID/Passport Number</Label>
                  <Input
                    id="id_number"
                    value={formData.id_number}
                    onChange={(e) => setFormData({ ...formData, id_number: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">E-Mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value) => setFormData({ ...formData, role: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="employee">Employee</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone_number">Phone Number</Label>
                  <Input
                    id="phone_number"
                    value={formData.phone_number}
                    onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department">Department (max 20 characters)</Label>
                  <Select
                    value={formData.department}
                    onValueChange={(value) => setFormData({ ...formData, department: value })}
                    disabled={isLoadingDepartments}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={isLoadingDepartments ? "Loading departments..." : "Select department"} />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.name}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isLoadingDepartments && (
                    <p className="text-sm text-gray-500">Loading departments...</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gender">Gender</Label>
                  <Select
                    value={formData.gender}
                    onValueChange={(value) => setFormData({ ...formData, gender: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editingUser && (
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={formData.is_active ? 'active' : 'inactive'}
                      onValueChange={(value) => setFormData({ ...formData, is_active: value === 'active' })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {/* Change Password button inside Edit dialog */}
                {editingUser && (
                  <div className="pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setIsDialogOpen(false);
                        handleOpenPasswordDialog(editingUser);
                      }}
                    >
                      <KeyRound className="mr-2 h-4 w-4" />
                      Change Password
                    </Button>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Saving...' : editingUser ? 'Update User' : 'Create User'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search Bar */}
{/* Search Bar */}
<div className="mb-6 flex flex-col sm:flex-row gap-3 items-start flex-wrap">
  <div className="relative flex-1 max-w-md">
    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
    <Input
      type="text"
      placeholder="Search by name, ID number, or department..."
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      className="pl-10"
    />
  </div>

  <Select value={filterDepartment} onValueChange={setFilterDepartment}>
    <SelectTrigger className="w-[220px]">
      <SelectValue placeholder="All departments" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">All departments</SelectItem>
      {departments
        .filter(d => d.is_active)
        .map(d => (
          <SelectItem key={d.id} value={d.name}>
            {d.name}
          </SelectItem>
        ))
      }
    </SelectContent>
  </Select>

  {filterDepartment !== 'all' && (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setFilterDepartment('all')}
      className="text-muted-foreground"
    >
      Clear
    </Button>
  )}
</div>

<p className="text-sm text-gray-500 mb-4">
  Showing {filteredUsers.length === 0 ? 0 : indexOfFirstUser + 1}–{Math.min(indexOfLastUser, filteredUsers.length)} of {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
  {(searchQuery || filterDepartment !== 'all') && ` (filtered from ${users.length} total)`}
</p>

      {/* ── Change Password Dialog ────────────────────────────────────────── */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password — {passwordTargetUser?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-4">
            {passwordError && (
              <Alert variant="destructive">
                <AlertDescription>{passwordError}</AlertDescription>
              </Alert>
            )}
            {passwordSuccess && (
              <Alert>
                <AlertDescription className="text-green-600">{passwordSuccess}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Minimum 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Repeat the new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsPasswordDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isChangingPassword}>
                {isChangingPassword ? 'Updating...' : 'Update Password'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {/* ─────────────────────────────────────────────────────────────────── */}

      {/* Excel Import Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Users from Excel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {importResults && (
              <Alert className={importResults.imported > 0 ? 'border-green-500' : 'border-yellow-500'}>
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-semibold">Import Results:</p>
                    <p className="text-green-600">✅ Successfully imported: {importResults.imported} user(s)</p>
                    {importResults.skipped > 0 && (
                      <p className="text-yellow-600">⚠️ Skipped: {importResults.skipped} user(s)</p>
                    )}
                    {importResults.errors.length > 0 && (
                      <div className="mt-2">
                        <p className="font-semibold text-red-600">Validation Errors:</p>
                        <div className="max-h-40 overflow-y-auto bg-gray-50 p-2 rounded mt-1">
                          <ul className="list-disc list-inside text-sm space-y-1">
                            {importResults.errors.map((err, index) => (
                              <li key={index} className="text-red-700">{err}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                    {importResults.duplicates.length > 0 && (
                      <div className="mt-2">
                        <p className="font-semibold text-orange-600">
                          Duplicates Found ({importResults.duplicates.length}):
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          Click &quot;Close&quot; to see detailed duplicate information.
                        </p>
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label>Step 1: Download Template</Label>
              <Button type="button" variant="outline" onClick={downloadTemplate} className="w-full">
                <Download className="mr-2 h-4 w-4" />
                Download Excel Template
              </Button>
              <p className="text-sm text-muted-foreground">
                Download the template file and fill in your user data. Department names will be automatically truncated to 20 characters.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="file-upload">Step 2: Upload Filled Template</Label>
              <Input
                id="file-upload"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                disabled={isImporting}
                ref={fileInputRef}
              />
              <p className="text-sm text-muted-foreground">
                Upload your completed Excel file. Duplicates will be automatically skipped.
              </p>
            </div>
            {isImporting && (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                <span className="ml-2">Processing file...</span>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleCloseImportDialog}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Duplicates Dialog */}
      <AlertDialog open={showDuplicatesDialog} onOpenChange={setShowDuplicatesDialog}>
        <AlertDialogContent className="max-w-3xl max-h-[80vh]">
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate Users Found</AlertDialogTitle>
            <AlertDialogDescription>
              The following entries were skipped because they already exist in the system:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-96 overflow-y-auto bg-gray-50 p-4 rounded">
            <ul className="space-y-2">
              {importResults?.duplicates.map((duplicate, index) => (
                <li key={index} className="text-sm border-b pb-2 last:border-b-0">
                  <span className="text-orange-600 font-medium">⚠️</span> {duplicate}
                </li>
              ))}
            </ul>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => {
              setShowDuplicatesDialog(false);
              setImportResults(null);
              setError('');
            }}>
              Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Deactivate Confirmation */}
      <AlertDialog open={!!deactivatingUser} onOpenChange={() => setDeactivatingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate User Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate {deactivatingUser?.name}&apos;s account?
              They will no longer be able to log in to their account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeactivate}
              className="bg-red-600 hover:bg-red-700"
              disabled={isDeactivating}
            >
              {isDeactivating ? 'Deactivating...' : 'Deactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Users Table */}
      <UsersTable users={currentUsers} onEdit={handleEdit} />

      {/* Pagination */}
      {filteredUsers.length > 0 && (
        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goToPreviousPage} disabled={currentPage === 1}>
              Previous
            </Button>
            <div className="flex gap-1">
              {getPageNumbers().map((page, index) => (
                page === '...' ? (
                  <span key={`ellipsis-${index}`} className="px-3 py-1">...</span>
                ) : (
                  <Button
                    key={page}
                    variant={currentPage === page ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => goToPage(page as number)}
                    className="min-w-[40px]"
                  >
                    {page}
                  </Button>
                )
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={goToNextPage} disabled={currentPage === totalPages}>
              Next
            </Button>
          </div>
        </div>
      )}

      {filteredUsers.length === 0 && (
        <div className="text-center py-10">
          <p className="text-gray-500">
            {searchQuery ? 'No users found matching your search.' : 'No users available.'}
          </p>
        </div>
      )}
    </div>
  );
}