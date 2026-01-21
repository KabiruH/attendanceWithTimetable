// app/(dashboard)/timetable/online-classes/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { 
  Laptop, 
  Search, 
  Calendar,
  Clock,
  Users,
  MapPin,
  BookOpen,
  Loader2,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Term {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

interface TimetableSlot {
  id: string;
  day_of_week: number;
  is_online_session: boolean;
  classes: {
    id: number;
    name: string;
    code: string;
  };
  subjects: {
    id: number;
    name: string;
    code: string;
    can_be_online: boolean;
  };
  rooms: {
    id: number;
    name: string;
  };
  lessonperiods: {
    id: number;
    name: string;
    start_time: string;
    end_time: string;
  };
  users: {
    id: number;
    name: string;
  };
  terms: {
    id: number;
    name: string;
  };
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function OnlineClassesPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<number | null>(null);
  const [timetableSlots, setTimetableSlots] = useState<TimetableSlot[]>([]);
  const [filteredSlots, setFilteredSlots] = useState<TimetableSlot[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDay, setFilterDay] = useState<string>('all');
  const [filterOnlineStatus, setFilterOnlineStatus] = useState<string>('all');

  // Check authorization
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/check');
        if (!response.ok) {
          router.push('/login');
          return;
        }

        const { user } = await response.json();
        const hasAccess = user.role === 'admin' || user.has_timetable_admin === true;

        if (!hasAccess) {
          toast({
            title: 'Unauthorized',
            description: 'You do not have permission to access this page',
            variant: 'destructive',
          });
          router.push('/dashboard');
        }
      } catch (error) {
        console.error('Auth check error:', error);
        router.push('/login');
      }
    };

    checkAuth();
  }, [router, toast]);

  // Fetch terms
useEffect(() => {
  const fetchTerms = async () => {
    try {
      const response = await fetch('/api/terms'); // ✅ Changed from '/api/term' to match your API
      if (response.ok) {
        const result = await response.json(); // ✅ Changed variable name to avoid confusion
        
        // ✅ Check if result has data property (from your API structure)
        const termsData = result.data || result; // Handle both API formats
        
        setTerms(termsData);
        
        // Auto-select active term
        const activeTerm = termsData.find((t: Term) => t.is_active); // ✅ Use termsData instead of data
        if (activeTerm) {
          setSelectedTermId(activeTerm.id);
        }
      }
    } catch (error) {
      console.error('Error fetching terms:', error);
      toast({
        title: 'Error',
        description: 'Failed to load terms',
        variant: 'destructive',
      });
    }
  };

  fetchTerms();
}, [toast]);

  // Fetch timetable slots when term is selected
  useEffect(() => {
    if (!selectedTermId) {
      setLoading(false);
      return;
    }

    const fetchTimetable = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/timetable?term_id=${selectedTermId}`);
        if (response.ok) {
          const { data } = await response.json();
          setTimetableSlots(data);
          setFilteredSlots(data);
        } else {
          throw new Error('Failed to fetch timetable');
        }
      } catch (error) {
        console.error('Error fetching timetable:', error);
        toast({
          title: 'Error',
          description: 'Failed to load timetable slots',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchTimetable();
  }, [selectedTermId, toast]);

  // Filter slots based on search and filters
  useEffect(() => {
    let filtered = [...timetableSlots];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(slot =>
        slot.subjects.name.toLowerCase().includes(query) ||
        slot.subjects.code.toLowerCase().includes(query) ||
        slot.classes.name.toLowerCase().includes(query) ||
        slot.classes.code.toLowerCase().includes(query) ||
        slot.users.name.toLowerCase().includes(query) ||
        slot.rooms.name.toLowerCase().includes(query)
      );
    }

    // Day filter
    if (filterDay !== 'all') {
      filtered = filtered.filter(slot => slot.day_of_week === parseInt(filterDay));
    }

    // Online status filter
    if (filterOnlineStatus !== 'all') {
      const isOnline = filterOnlineStatus === 'online';
      filtered = filtered.filter(slot => slot.is_online_session === isOnline);
    }

    setFilteredSlots(filtered);
  }, [searchQuery, filterDay, filterOnlineStatus, timetableSlots]);

  // Toggle online status
  const handleToggleOnline = async (slotId: string, currentStatus: boolean, canBeOnline: boolean) => {
    if (!canBeOnline && !currentStatus) {
      toast({
        title: 'Cannot Enable Online',
        description: 'This subject is not configured to allow online sessions. Please update the subject settings first.',
        variant: 'destructive',
      });
      return;
    }

    setUpdating(slotId);
    try {
      const response = await fetch('/api/timetable', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: slotId,
          is_online_session: !currentStatus,
        }),
      });

      if (response.ok) {
        const { data } = await response.json();
        
        // Update local state
        setTimetableSlots(prev =>
          prev.map(slot => (slot.id === slotId ? data : slot))
        );

        toast({
          title: 'Success',
          description: `Session marked as ${!currentStatus ? 'ONLINE' : 'PHYSICAL'}`,
        });
      } else {
        const error = await response.json();
        throw new Error(error.details || error.error || 'Failed to update');
      }
    } catch (error) {
      console.error('Error toggling online status:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update online status',
        variant: 'destructive',
      });
    } finally {
      setUpdating(null);
    }
  };

  // Group slots by day
  const groupedSlots = filteredSlots.reduce((acc, slot) => {
    const day = DAYS[slot.day_of_week];
    if (!acc[day]) acc[day] = [];
    acc[day].push(slot);
    return acc;
  }, {} as Record<string, TimetableSlot[]>);

  // Sort slots within each day by start time
  Object.keys(groupedSlots).forEach(day => {
    groupedSlots[day].sort((a, b) => 
      a.lessonperiods.start_time.localeCompare(b.lessonperiods.start_time)
    );
  });

  const stats = {
    total: timetableSlots.length,
    online: timetableSlots.filter(s => s.is_online_session).length,
    physical: timetableSlots.filter(s => !s.is_online_session).length,
    canBeOnline: timetableSlots.filter(s => s.subjects.can_be_online).length,
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Laptop className="h-8 w-8 text-blue-600" />
            Online Classes Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Toggle specific timetable slots to online or physical sessions
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Online Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.online}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Physical Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.physical}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Can Be Online
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{stats.canBeOnline}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Term Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Term</label>
              <Select
                value={selectedTermId?.toString() || ''}
                onValueChange={(value) => setSelectedTermId(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select term" />
                </SelectTrigger>
                <SelectContent>
                  {terms.map(term => (
                    <SelectItem key={term.id} value={term.id.toString()}>
                      {term.name} {term.is_active && '(Active)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Subject, class, trainer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Day Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Day</label>
              <Select value={filterDay} onValueChange={setFilterDay}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Days</SelectItem>
                  {DAYS.map((day, index) => (
                    <SelectItem key={index} value={index.toString()}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Session Type</label>
              <Select value={filterOnlineStatus} onValueChange={setFilterOnlineStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sessions</SelectItem>
                  <SelectItem value="online">Online Only</SelectItem>
                  <SelectItem value="physical">Physical Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timetable Slots */}
      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : filteredSlots.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-muted-foreground">
              {selectedTermId ? 'No timetable slots found' : 'Please select a term'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedSlots).map(([day, slots]) => (
            <Card key={day}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {day}
                  <Badge variant="outline" className="ml-2">
                    {slots.length} {slots.length === 1 ? 'session' : 'sessions'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {slots.map((slot) => (
                    <div
                      key={slot.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="font-semibold text-lg">
                            {slot.subjects.name}
                          </h3>
                          <Badge variant="secondary">
                            {slot.subjects.code}
                          </Badge>
                          {slot.is_online_session && (
                            <Badge className="bg-green-600 hover:bg-green-700">
                              <Laptop className="h-3 w-3 mr-1" />
                              Online
                            </Badge>
                          )}
                          {!slot.subjects.can_be_online && (
                            <Badge variant="destructive">
                              Physical Only
                            </Badge>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-sm text-muted-foreground">
                        
                          <div className="flex items-center gap-1">
                            <BookOpen className="h-4 w-4" />
                            {slot.classes.name}
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            {slot.users.name}
                          </div>
                          <div className="flex items-center gap-1">
                            <MapPin className="h-4 w-4" />
                            {slot.rooms.name}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 ml-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {slot.is_online_session ? 'Online' : 'Physical'}
                          </span>
                          <Switch
                            checked={slot.is_online_session}
                            onCheckedChange={() =>
                              handleToggleOnline(
                                slot.id,
                                slot.is_online_session,
                                slot.subjects.can_be_online
                              )
                            }
                            disabled={updating === slot.id}
                          />
                        </div>
                        {updating === slot.id && (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}