// app/timetable/settings/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Ban, Calendar, UserCog } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import TimetableAdminsSection from '@/components/timetable/settings/TimetableAdminsSection';
import UserAccessControlSection from '@/components/timetable/settings/UserAccessControlSection';
import TimetableGenerationDeadlineSection from '@/components/timetable/settings/SubjectDeadlineSection';

export default function TimetableSettingsPage() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  const fetchCurrentUser = async () => {
    try {
      const response = await fetch('/api/auth/check');
      if (!response.ok) throw new Error('Failed to fetch user');
      const data = await response.json();
      setCurrentUser(data.user);
    } catch (error) {
      console.error('Error fetching user:', error);
      toast({
        title: "Error",
        description: "Failed to load user data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (currentUser?.role !== 'admin') {
    return (
      <div className="container mx-auto py-6">
        <Alert variant="destructive">
          <AlertDescription>
            You don't have permission to access this page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Timetable Management Settings</h1>
        <p className="text-gray-600 mt-2">
          Configure timetable permissions, deadlines, and user access controls
        </p>
      </div>

      <Tabs defaultValue="admins" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="admins" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Timetable Admins
          </TabsTrigger>
          <TabsTrigger value="access" className="flex items-center gap-2">
            <Ban className="h-4 w-4" />
            Classes & Subjects 
          </TabsTrigger>
          <TabsTrigger value="deadline" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Deadlines
          </TabsTrigger>
        </TabsList>

        <TabsContent value="admins" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Timetable Administrators</CardTitle>
              <CardDescription>
                Grant employees full timetable management privileges
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TimetableAdminsSection />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="access" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Access Control</CardTitle>
              <CardDescription>
                Block users from selecting classes and subjects
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UserAccessControlSection />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deadline" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Subject Selection Deadline</CardTitle>
              <CardDescription>
                Set deadlines for trainers to select their subjects
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TimetableGenerationDeadlineSection />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assignment" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Admin Assignment Control</CardTitle>
              <CardDescription>
                Assign classes and subjects on behalf of trainers
              </CardDescription>
            </CardHeader>
           
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}