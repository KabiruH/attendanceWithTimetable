'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlusCircle, Upload, Download, Settings, User, Search, X, Calendar } from "lucide-react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import ClassesTable from '@/components/classes/ClassesTable';
import ClassesForm from '@/components/classes/ClassesForm';
import ClassSelection from '@/components/classes/ClassSelection';
import MyClasses from '@/components/classes/MyClasses';
import * as XLSX from 'xlsx';

interface Class {
    id: number;
    name: string;
    code: string;
    description?: string;
    department: string;
    duration_hours: number;
    is_active: boolean;
    created_at: string;
    created_by: string;
}

interface User {
    id: number;
    name: string;
    role: string;
    department: string;
    has_timetable_admin: boolean;
}

interface Term {
    id: number;
    name: string;
    start_date: string;
    end_date: string;
    is_active: boolean;
}

export default function ClassesPage() {
    // State management
    const [user, setUser] = useState<User | null>(null);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [classes, setClasses] = useState<Class[]>([]);
    const [terms, setTerms] = useState<Term[]>([]);
    const [selectedTerm, setSelectedTerm] = useState<number | null>(null);
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [error, setError] = useState('');
    const [importError, setImportError] = useState('');
    const [editingClass, setEditingClass] = useState<Class | null>(null);
    const [deactivatingClass, setDeactivatingClass] = useState<Class | null>(null);
    const [isDeactivating, setIsDeactivating] = useState(false);
    const [activeTab, setActiveTab] = useState<string>('');

    // Pagination state
    const [pageSize, setPageSize] = useState<number>(20);
    const [currentPage, setCurrentPage] = useState<number>(1);

    // Add refresh triggers for child components
    const [refreshMyClasses, setRefreshMyClasses] = useState(0);
    const [refreshClassSelection, setRefreshClassSelection] = useState(0);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const isAdmin = userRole === 'admin';
    const isTrainer = userRole === 'employee';
    const isTimetableAdmin = user?.has_timetable_admin === true;
    const hasManageAccess = isAdmin || isTimetableAdmin;

    // Filtered classes based on search term
    const filteredClasses = useMemo(() => {
        if (!searchTerm.trim()) return classes;
        const term = searchTerm.toLowerCase();
        return classes.filter(classItem =>
            classItem.name.toLowerCase().includes(term) ||
            classItem.code.toLowerCase().includes(term) ||
            classItem.department.toLowerCase().includes(term)
        );
    }, [classes, searchTerm]);

    // Reset to page 1 when search changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    // Pagination derived values
    const totalClasses = filteredClasses.length;
    const totalPages = Math.ceil(totalClasses / pageSize);
    const paginatedClasses = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredClasses.slice(start, start + pageSize);
    }, [filteredClasses, currentPage, pageSize]);

    // Clear search function
    const clearSearch = () => {
        setSearchTerm('');
        setCurrentPage(1);
    };

    useEffect(() => {
        authenticateUser();
    }, []);

    useEffect(() => {
        fetchTerms();
    }, []);

    const authenticateUser = async () => {
        try {
            const authResponse = await fetch("/api/auth/check", { method: "GET" });
            if (!authResponse.ok) throw new Error("Authentication failed");
            const authData = await authResponse.json();
            const { user } = authData;
            setUser(user);
            setUserRole(user.role);
        } catch (error) {
            console.error('Error authenticating user:', error);
        }
    };

    const fetchTerms = async () => {
        try {
            const response = await fetch('/api/terms');
            if (!response.ok) throw new Error('Failed to fetch terms');
            const data = await response.json();
            setTerms(data.data || []);

            const activeResponse = await fetch('/api/terms/active');
            if (activeResponse.ok) {
                const activeData = await activeResponse.json();
                setSelectedTerm(activeData.data.id);
            } else if (data.data.length > 0) {
                setSelectedTerm(data.data[0].id);
            }
        } catch (error) {
            console.error('Error fetching terms:', error);
        }
    };

    useEffect(() => {
        if (userRole) {
            if (hasManageAccess) {
                setActiveTab('manage');
            } else {
                setActiveTab('select');
            }
        }
    }, [userRole, hasManageAccess]);

    useEffect(() => {
        if (userRole) {
            if (hasManageAccess) {
                fetchClasses();
            } else {
                setIsLoading(false);
            }
        }
    }, [userRole, hasManageAccess]);

    const fetchClasses = async () => {
        try {
            const response = await fetch('/api/classes');
            if (!response.ok) throw new Error('Failed to fetch classes');
            const data = await response.json();
            setClasses(data);
        } catch (error) {
            console.error('Error fetching classes:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenForm = () => {
        setEditingClass(null);
        setError('');
        setIsFormOpen(true);
    };

    const handleEdit = (classItem: Class) => {
        setEditingClass(classItem);
        setError('');
        setIsFormOpen(true);
    };

    const handleSaveClass = async (formData: any) => {
        setError('');
        setIsSubmitting(true);
        try {
            const url = '/api/classes';
            const method = editingClass ? 'PUT' : 'POST';
            const body = editingClass ? { ...formData, id: editingClass.id } : formData;

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to save class');

            await fetchClasses();
            setIsFormOpen(false);
            setEditingClass(null);
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Failed to save class');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCloseForm = () => {
        setIsFormOpen(false);
        setEditingClass(null);
        setError('');
    };

    const handleDeactivate = async (classItem: Class) => {
        setDeactivatingClass(classItem);
    };

    const confirmDeactivate = async () => {
        if (!deactivatingClass) return;
        setIsDeactivating(true);
        try {
            const response = await fetch(`/api/classes/${deactivatingClass.id}/toggle-status`, {
                method: 'POST',
            });
            if (!response.ok) throw new Error('Failed to update class status');
            await fetchClasses();
        } catch (error) {
            console.error('Error updating class:', error);
        } finally {
            setIsDeactivating(false);
            setDeactivatingClass(null);
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        setImportError('');

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            const formattedClasses = jsonData.map((row: any, index: number) => {
                const requiredFields = ['name', 'code', 'department'];
                const missingFields = requiredFields.filter(field => !row[field]);
                if (missingFields.length > 0) {
                    throw new Error(`Row ${index + 2}: Missing required fields: ${missingFields.join(', ')}`);
                }
                return {
                    name: row.name,
                    code: row.code.toString().toUpperCase(),
                    description: row.description || '',
                    department: row.department,
                    duration_hours: row.duration_hours || 2,
                    is_active: row.is_active !== false,
                    created_by: 'excel_import'
                };
            });

            const response = await fetch('/api/classes/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ classes: formattedClasses }),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to import classes');

            await fetchClasses();
            alert(`Successfully imported ${result.imported} classes!`);
        } catch (error) {
            setImportError(error instanceof Error ? error.message : 'Failed to import file');
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const downloadTemplate = () => {
        const template = [
            {
                name: 'Digital Marketing Fundamentals',
                code: 'DM101',
                description: 'Introduction to digital marketing strategies',
                department: 'Marketing',
                duration_hours: 2,
                is_active: true
            }
        ];
        const worksheet = XLSX.utils.json_to_sheet(template);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Classes');
        XLSX.writeFile(workbook, 'classes_template.xlsx');
    };

    const handleClassSelectionSaved = () => setRefreshMyClasses(prev => prev + 1);
    const handleClassRemoved = () => setRefreshClassSelection(prev => prev + 1);
    const handleClassesLoaded = (loadedClasses: Class[]) => {
        setClasses(loadedClasses);
        setIsLoading(false);
    };

    if (isLoading || !userRole || !user) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-10">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold">
                        {hasManageAccess ? 'Classes Management' : 'My Training Classes'}
                    </h1>
                    <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline">{user.name}</Badge>
                        <Badge variant={isAdmin ? "default" : isTimetableAdmin ? "secondary" : "outline"}>
                            {isAdmin ? 'Administrator' : isTimetableAdmin ? 'Timetable Admin' : 'Trainer'}
                        </Badge>
                    </div>
                </div>
            </div>

            {/* Import error alert */}
            {importError && (
                <Alert variant="destructive" className="mb-6">
                    <AlertDescription>{importError}</AlertDescription>
                </Alert>
            )}

            {/* Term Selection */}
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <Label htmlFor="term" className="flex items-center gap-2 mb-2">
                    <Calendar className="h-4 w-4" />
                    <span className="font-semibold">Select Term</span>
                </Label>
                <Select
                    value={selectedTerm?.toString()}
                    onValueChange={(value) => setSelectedTerm(parseInt(value))}
                >
                    <SelectTrigger className="bg-white max-w-md">
                        <SelectValue placeholder="Select a term" />
                    </SelectTrigger>
                    <SelectContent>
                        {terms.map((term) => (
                            <SelectItem key={term.id} value={term.id.toString()}>
                                {term.name} {term.is_active && '(Active)'}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-2">
                    Class assignments and subjects are term-specific. Select the term to view or manage.
                </p>
            </div>

            {/* Show warning if no term selected */}
            {!selectedTerm && (
                <Alert className="mb-6">
                    <AlertDescription>
                        Please select a term above to view and manage classes.
                    </AlertDescription>
                </Alert>
            )}

            {/* Role-based content */}
            {selectedTerm && (
                <>
                    {hasManageAccess ? (
                        // ADMIN VIEW
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                            <TabsList>
                                <TabsTrigger value="manage" className="flex items-center gap-2">
                                    <Settings className="h-4 w-4" />
                                    Manage Classes
                                </TabsTrigger>
                                <TabsTrigger value="select" className="flex items-center gap-2">
                                    <User className="h-4 w-4" />
                                    My Teaching
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="manage" className="space-y-6">

                                {/* Search + Counter + Page Size */}
                                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                                    <div className="relative flex-1 max-w-md">
                                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                                        <Input
                                            placeholder="Search by class name, code, or department..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="pl-10 pr-10"
                                        />
                                        {searchTerm && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={clearSearch}
                                                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0 hover:bg-gray-200"
                                            >
                                                <X className="h-3 w-3" />
                                            </Button>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-3 text-sm text-gray-600">
                                        <span className="font-medium">
                                            {searchTerm
                                                ? `${filteredClasses.length} of ${classes.length} classes`
                                                : `${classes.length} total class${classes.length !== 1 ? 'es' : ''}`
                                            }
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-gray-400">Show:</span>
                                            <Select
                                                value={pageSize.toString()}
                                                onValueChange={v => { setPageSize(parseInt(v)); setCurrentPage(1); }}
                                            >
                                                <SelectTrigger className="h-8 w-20 text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="20">20</SelectItem>
                                                    <SelectItem value="50">50</SelectItem>
                                                    <SelectItem value="100">100</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>

                                {/* Admin Controls */}
                                <div className="flex justify-end gap-2">
                                    <Button variant="outline" onClick={downloadTemplate}>
                                        <Download className="mr-2 h-4 w-4" />
                                        Download Template
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isImporting}
                                    >
                                        <Upload className="mr-2 h-4 w-4" />
                                        {isImporting ? 'Importing...' : 'Import Excel'}
                                    </Button>
                                    <Button onClick={handleOpenForm}>
                                        <PlusCircle className="mr-2 h-4 w-4" />
                                        Add Class
                                    </Button>
                                </div>

                                {/* Empty search state */}
                                {searchTerm && filteredClasses.length === 0 && (
                                    <div className="text-center py-8 text-gray-500">
                                        <Search className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                                        <p className="text-lg font-medium">No classes found</p>
                                        <p className="text-sm">Try adjusting your search terms</p>
                                        <Button variant="outline" onClick={clearSearch} className="mt-3">
                                            Clear search
                                        </Button>
                                    </div>
                                )}

                                {/* Table */}
                                {(!searchTerm || filteredClasses.length > 0) && (
                                    <>
                                        <ClassesTable
                                            classes={paginatedClasses}
                                            termId={selectedTerm}
                                            onEdit={handleEdit}
                                            onDeactivate={handleDeactivate}
                                            startIndex={(currentPage - 1) * pageSize}
                                        />

                                        {/* Pagination controls */}
                                        {totalPages > 1 && (
                                            <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
                                                <span>
                                                    Showing {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, totalClasses)} of {totalClasses} classes
                                                </span>
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setCurrentPage(1)}
                                                        disabled={currentPage === 1}
                                                        className="h-8 px-2 text-xs"
                                                    >
                                                        «
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setCurrentPage(p => p - 1)}
                                                        disabled={currentPage === 1}
                                                        className="h-8 px-2 text-xs"
                                                    >
                                                        ‹ Prev
                                                    </Button>
                                                    <span className="px-3 py-1 rounded border bg-white font-medium">
                                                        {currentPage} / {totalPages}
                                                    </span>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setCurrentPage(p => p + 1)}
                                                        disabled={currentPage === totalPages}
                                                        className="h-8 px-2 text-xs"
                                                    >
                                                        Next ›
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setCurrentPage(totalPages)}
                                                        disabled={currentPage === totalPages}
                                                        className="h-8 px-2 text-xs"
                                                    >
                                                        »
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </TabsContent>

                            <TabsContent value="select" className="space-y-6">
                                <div className="grid gap-6 lg:grid-cols-1">
                                    <MyClasses
                                        userId={user.id}
                                        termId={selectedTerm}
                                        showRemoveOption={true}
                                        onClassRemoved={handleClassRemoved}
                                        key={`classes-${refreshMyClasses}-${selectedTerm}`}
                                    />
                                    <ClassSelection
                                        userId={user.id}
                                        termId={selectedTerm}
                                        onSelectionSaved={handleClassSelectionSaved}
                                        key={`selection-${refreshClassSelection}-${selectedTerm}`}
                                    />
                                </div>
                            </TabsContent>
                        </Tabs>
                    ) : (
                        // TRAINER VIEW
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                            <TabsList>
                                <TabsTrigger value="select" className="flex items-center gap-2">
                                    <PlusCircle className="h-4 w-4" />
                                    Select Classes
                                </TabsTrigger>
                                <TabsTrigger value="my-classes" className="flex items-center gap-2">
                                    <User className="h-4 w-4" />
                                    My Classes
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="select" className="space-y-6">
                                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                                    <div className="relative flex-1 max-w-md">
                                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                                        <Input
                                            placeholder="Search available classes..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="pl-10 pr-10"
                                        />
                                        {searchTerm && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={clearSearch}
                                                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0 hover:bg-gray-200"
                                            >
                                                <X className="h-3 w-3" />
                                            </Button>
                                        )}
                                    </div>
                                    {searchTerm && classes.length > 0 && (
                                        <div className="text-sm text-gray-500">
                                            {filteredClasses.length} of {classes.length} classes found
                                        </div>
                                    )}
                                </div>

                                <ClassSelection
                                    userId={user.id}
                                    termId={selectedTerm}
                                    onSelectionSaved={handleClassSelectionSaved}
                                    searchTerm={searchTerm}
                                    onClassesLoaded={handleClassesLoaded}
                                    key={`selection-${refreshClassSelection}-${selectedTerm}`}
                                />
                            </TabsContent>

                            <TabsContent value="my-classes" className="space-y-6">
                                <MyClasses
                                    userId={user.id}
                                    termId={selectedTerm}
                                    showRemoveOption={true}
                                    onClassRemoved={handleClassRemoved}
                                    key={`classes-${refreshMyClasses}-${selectedTerm}`}
                                />
                            </TabsContent>
                        </Tabs>
                    )}
                </>
            )}

            <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
            />

            {hasManageAccess && (
                <>
                    <ClassesForm
                        isOpen={isFormOpen}
                        onClose={handleCloseForm}
                        editingClass={editingClass}
                        onSave={handleSaveClass}
                        isSubmitting={isSubmitting}
                        error={error}
                    />

                    <AlertDialog
                        open={!!deactivatingClass}
                        onOpenChange={() => setDeactivatingClass(null)}
                    >
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>
                                    {deactivatingClass?.is_active ? 'Deactivate' : 'Activate'} Class
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    Are you sure you want to {deactivatingClass?.is_active ? 'deactivate' : 'activate'} the class "{deactivatingClass?.name}"?
                                    {deactivatingClass?.is_active && ' Trainers will no longer be able to check into this class.'}
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={confirmDeactivate}
                                    className={deactivatingClass?.is_active ? "bg-red-600 hover:bg-red-700" : ""}
                                    disabled={isDeactivating}
                                >
                                    {isDeactivating ? 'Updating...' : deactivatingClass?.is_active ? 'Deactivate' : 'Activate'}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </>
            )}
        </div>
    );
}