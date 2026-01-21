// components/DashboardSidebar.tsx
'use client';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  useSidebar,
} from "@/components/ui/sidebar";
import { 
  LayoutDashboard, 
  ClipboardCheck, 
  FileBarChart, 
  User as UserIcon, 
  Users, 
  LogOut, 
  Shield, 
  Calendar, 
  Settings,
  ChevronDown,
  ChevronRight,
  Building2,
  GraduationCap,
  DoorOpen,
  ClockIcon,
  CalendarDays,
  BookOpen,
  Laptop,
} from "lucide-react";
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/use-toast';

interface User {
  id: string;
  email: string;
  role: string;
  name: string;
  has_timetable_admin?: boolean;
}

type NavItem = {
  label: string;
  icon: React.ReactNode;
  href: string;
  type?: 'link' | 'action';
  action?: () => void;
};

type SubMenuItem = {
  label: string;
  icon: React.ReactNode;
  href: string;
};

export function DashboardSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isTimetableSetupOpen, setIsTimetableSetupOpen] = useState(false);
  const { setOpen, isMobile } = useSidebar();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/check', {
          method: 'GET',
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();
          setCurrentUser(data.user);
        } else {
          setCurrentUser(null);
          router.push('/login');
        }
      } catch (error) {
        console.error('Sidebar auth check error:', error);
        setCurrentUser(null);
        router.push('/login');
      }
    };
    checkAuth();

    // Set up an interval to refresh user data every 30 seconds
    // This ensures that if an admin grants timetable access, it reflects quickly
    const refreshInterval = setInterval(checkAuth, 30000);

    return () => clearInterval(refreshInterval);
  }, [router]);

  // Auto-expand admin menu if on an admin page
  useEffect(() => {
    const adminPaths = ['/departments', '/users', '/login-logs'];
    if (adminPaths.some(path => pathname.startsWith(path))) {
      setIsAdminOpen(true);
    }

    const timetablePaths = ['/timetable', '/rooms', '/term', '/subjects', '/lesson-periods', '/classes'];
    if (timetablePaths.some(path => pathname.startsWith(path))) {
      setIsTimetableSetupOpen(true);
    }
  }, [pathname]);

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });

      if (res.ok) {
        toast({
          title: "Success",
          description: "Logged out successfully",
        });
        setCurrentUser(null);
        router.push('/login');
      } else {
        throw new Error('Failed to log out');
      }
    } catch (error) {
      console.error('Error during logout:', error);
      toast({
        title: "Error",
        description: "Failed to log out",
        variant: "destructive",
      });
    }
  };

  const handleNavClick = () => {
    if (isMobile) {
      setOpen(false);
    }
  };

  const baseNavItems: NavItem[] = [
    {
      label: 'Dashboard',
      icon: <LayoutDashboard size={20} />,
      href: '/dashboard',
      type: 'link'
    },
    {
      label: 'Attendance',
      icon: <ClipboardCheck size={20} />,
      href: '/attendance',
      type: 'link'
    },
    {
      label: 'Reports',
      icon: <FileBarChart size={20} />,
      href: '/reports',
      type: 'link'
    },
     {
      label: 'Classes',
      icon: <GraduationCap size={20} />,
      href: '/classes',
      type: 'link'
    },
    {
      label: 'Profile',
      icon: <UserIcon size={20} />,
      href: '/profile',
      type: 'link'
    },
    {
      label: 'Logout',
      icon: <LogOut size={20} />,
      href: '#',
      type: 'action',
      action: handleLogout
    }
  ];

  // Timetable Setup menu items (for admin and timetable admins)
  const timetableSetupItems: SubMenuItem[] = [
       {
      label: 'Terms',
      icon: <Calendar size={18} />,
      href: '/term'
    },
    {
      label: 'Rooms',
      icon: <DoorOpen size={18} />,
      href: '/rooms'
    },
    {
      label: 'Lesson Periods',
      icon: <ClockIcon size={18} />,
      href: '/lesson-periods'
    },
    {
      label: 'Subjects',
      icon: <BookOpen size={18} />,
      href: '/subjects'
    },
    {
      label: 'Classes',
      icon: <GraduationCap size={18} />,
      href: '/classes'
    },
     {
      label: 'Online Classes', 
      icon: <Laptop size={18} />,
      href: '/timetable/online-classes'
    },
    {
      label: 'Class/Subject Assignment',
      icon: <CalendarDays size={18} />,
      href: '/timetable/adminAssignment'
    },
     {
      label: 'Timetable',
      icon: <CalendarDays size={18} />,
      href: '/timetable'
    },
     
  ];

  // Admin-only menu items
  const adminOnlyItems: SubMenuItem[] = [
    {
      label: 'Departments',
      icon: <Building2 size={18} />,
      href: '/departments'
    },
    {
      label: 'Employees',
      icon: <Users size={18} />,
      href: '/users'
    },
    {
      label: 'Login Logs',
      icon: <Shield size={18} />,
      href: '/login-logs'
    },
    {
      label: 'Timetable Settings',
      icon: <Settings size={18} />,
      href: '/timetable/settings'
    },
  ];

  if (!currentUser) {
    return null;
  }

  // Safely get the role and ensure has_timetable_admin defaults to false
  const isAdmin = currentUser?.role === 'admin';
  const hasTimetableAdmin = currentUser?.has_timetable_admin === true;
  const isRegularEmployee = currentUser?.role === 'employee' && !hasTimetableAdmin && !isAdmin;

  return (
    <Sidebar className="mt-16 bg-slate-900 border-r border-slate-700">
      <SidebarContent>
        <SidebarGroup>
          <nav className="p-4">
            <ul className="space-y-2">
              {/* Base navigation items */}
              {baseNavItems.slice(0, 3).map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={handleNavClick}
                    className={`flex items-center space-x-3 p-3 rounded-lg
                      transition-all duration-200
                      ${pathname === item.href
                        ? 'bg-blue-600 text-white font-semibold shadow-lg'
                        : 'text-black hover:bg-blue-500 hover:text-white'
                      }`}
                  >
                    <span className="transition-transform duration-200 hover:scale-110">
                      {item.icon}
                    </span>
                    <span className="font-medium">{item.label}</span>
                  </Link>
                </li>
              ))}

              {/* My Timetable - For Regular Employees Only */}
              {isRegularEmployee && (
                <li>
                  <Link
                    href="/timetable"
                    onClick={handleNavClick}
                    className={`flex items-center space-x-3 p-3 rounded-lg
                      transition-all duration-200
                      ${pathname === '/timetable'
                        ? 'bg-blue-600 text-white font-semibold shadow-lg'
                        : 'text-black hover:bg-blue-500 hover:text-white'
                      }`}
                  >
                    <span className="transition-transform duration-200 hover:scale-110">
                      <CalendarDays size={20} />
                    </span>
                    <span className="font-medium">My Timetable</span>
                  </Link>
                </li>
              )}

              {/* Timetable Setup Dropdown (Admin OR Timetable Admin) */}
              {(isAdmin || hasTimetableAdmin) && (
                <li>
                  <button
                    onClick={() => setIsTimetableSetupOpen(!isTimetableSetupOpen)}
                    className={`w-full flex items-center justify-between space-x-3 p-3 rounded-lg
                      transition-all duration-200 text-left
                      ${timetableSetupItems.some(item => pathname.startsWith(item.href))
                        ? 'bg-blue-600 text-white font-semibold shadow-lg'
                        : 'text-black hover:bg-blue-500 hover:text-white'
                      }`}
                  >
                    <div className="flex items-center space-x-3">
                      <CalendarDays size={20} />
                      <span className="font-medium">Timetable Setup</span>
                    </div>
                    {isTimetableSetupOpen ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                  </button>

                  {/* Timetable Setup Submenu */}
                  {isTimetableSetupOpen && (
                    <ul className="mt-1 ml-4 space-y-1 border-l-2 border-slate-700 pl-3">
                      {timetableSetupItems.map((subItem) => (
                        <li key={subItem.href}>
                          <Link
                            href={subItem.href}
                            onClick={handleNavClick}
                            className={`flex items-center space-x-2 p-2 rounded-lg text-sm
                              transition-all duration-200
                              ${pathname === subItem.href || pathname.startsWith(subItem.href)
                                ? 'bg-blue-500 text-white font-medium'
                                : 'text-black hover:bg-blue-400 hover:text-white'
                              }`}
                          >
                            <span>{subItem.icon}</span>
                            <span>{subItem.label}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )}

              {/* Admin Settings Dropdown (Full Admin Only) */}
              {isAdmin && (
                <li>
                  <button
                    onClick={() => setIsAdminOpen(!isAdminOpen)}
                    className={`w-full flex items-center justify-between space-x-3 p-3 rounded-lg
                      transition-all duration-200 text-left
                      ${adminOnlyItems.some(item => pathname.startsWith(item.href))
                        ? 'bg-blue-600 text-white font-semibold shadow-lg'
                        : 'text-black hover:bg-blue-500 hover:text-white'
                      }`}
                  >
                    <div className="flex items-center space-x-3">
                      <Settings size={20} />
                      <span className="font-medium">Admin Settings</span>
                    </div>
                    {isAdminOpen ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                  </button>

                  {/* Admin Submenu */}
                  {isAdminOpen && (
                    <ul className="mt-1 ml-4 space-y-1 border-l-2 border-slate-700 pl-3">
                      {adminOnlyItems.map((subItem) => (
                        <li key={subItem.href}>
                          <Link
                            href={subItem.href}
                            onClick={handleNavClick}
                            className={`flex items-center space-x-2 p-2 rounded-lg text-sm
                              transition-all duration-200
                              ${pathname === subItem.href || pathname.startsWith(subItem.href)
                                ? 'bg-blue-500 text-white font-medium'
                                : 'text-black hover:bg-blue-400 hover:text-white'
                              }`}
                          >
                            <span>{subItem.icon}</span>
                            <span>{subItem.label}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )}

              {/* Profile and Logout */}
              {baseNavItems.slice(3).map((item) => (
                <li key={item.href}>
                  {item.type === 'link' ? (
                    <Link
                      href={item.href}
                      onClick={handleNavClick}
                      className={`flex items-center space-x-3 p-3 rounded-lg
                        transition-all duration-200
                        ${pathname === item.href
                          ? 'bg-blue-600 text-white font-semibold shadow-lg'
                          : 'text-black hover:bg-blue-500 hover:text-white'
                        }`}
                    >
                      <span className="transition-transform duration-200 hover:scale-110">
                        {item.icon}
                      </span>
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  ) : (
                    <button
                      onClick={() => {
                        item.action?.();
                        handleNavClick();
                      }}
                      className="w-full flex items-center space-x-3 p-3 rounded-lg
                        text-black hover:bg-red-600 hover:text-white
                        transition-all duration-200 text-left"
                    >
                      <span className="transition-transform duration-200 hover:scale-110">
                        {item.icon}
                      </span>
                      <span className="font-medium">{item.label}</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-slate-700">
        <div className="p-4">
          <div className="text-sm text-white/80 text-center font-medium">
            Licensed by Optimum Computer Services
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}