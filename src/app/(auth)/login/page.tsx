'use client';
import { useEffect, useState } from 'react';
import LoginForm from '@/components/auth/LoginForm';
import { Clock, Users, Shield, MapPin, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";
import { checkLocationWithDistance } from '@/lib/geofence';

interface LocationResult {
  isWithinArea: boolean;
  distanceFromCenter: number;
  distanceFromEdge: number;
  userLocation: { latitude: number; longitude: number };
  formattedDistance: string;
}

export default function LoginPage() {
  const [locationResult, setLocationResult] = useState<LocationResult | null>(null);
  const [checkingLocation, setCheckingLocation] = useState(true);
  const [locationError, setLocationError] = useState<string>('');

  useEffect(() => {
    async function verifyLocation() {
      try {
        const result = await checkLocationWithDistance();
        setLocationResult(result);
      } catch (error: any) {
        setLocationError(error.message || 'Could not verify location');
      } finally {
        setCheckingLocation(false);
      }
    }
    verifyLocation();
  }, []);

  const renderLocationBanner = () => {
    if (checkingLocation) {
      return (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl px-4 py-3 mb-5">
          <Loader2 className="w-5 h-5 animate-spin shrink-0" />
          <p className="text-sm font-medium">Checking your location...</p>
        </div>
      );
    }

    if (locationError) {
      return (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 mb-5">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">Location unavailable</p>
            <p className="text-sm">Please enable GPS to verify your location. You can still login but attendance check-in will require being on campus.</p>
          </div>
        </div>
      );
    }

    if (locationResult?.isWithinArea) {
      return (
        <div className="flex items-start gap-3 bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 mb-5">
          <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">You are within the school</p>
            <p className="text-sm">You are {locationResult.formattedDistance}. You can mark attendance after logging in.</p>
          </div>
        </div>
      );
    }

    if (locationResult && !locationResult.isWithinArea) {
      return (
        <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 text-orange-800 rounded-xl px-4 py-3 mb-5">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">You are outside the school</p>
            <p className="text-sm">
              You are {locationResult.formattedDistance} away. You can still login, but{' '}
              <span className="font-semibold">you will not be able to check in to work</span>{' '}
              unless you are within the allowed location.
            </p>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Hero Section */}
      <div className="hidden lg:flex lg:w-1/2 bg-blue-600 flex-col justify-between p-16">
        <div className="flex flex-col justify-center items-center h-full">
          <h1 className="text-4xl font-bold text-white mb-6">
            Welcome to our Attendance System
          </h1>
          <p className="text-blue-100 text-2xl mb-12">
            Streamline your attendance tracking with our modern platform.
          </p>
          <div className="space-y-6">
            <div className="flex items-center space-x-4">
              <Clock className="w-9 h-9 text-blue-200" />
              <p className="text-white text-xl">Instant work & class check-in</p>
            </div>
            <div className="flex items-center space-x-4">
              <Shield className="w-9 h-9 text-blue-200" />
              <p className="text-white text-xl">Location-verified attendance</p>
            </div>
            <div className="flex items-center space-x-4">
              <Users className="w-9 h-9 text-blue-200" />
              <p className="text-white text-xl">Track team attendance</p>
            </div>
            <div className="flex items-center space-x-4">
              <MapPin className="w-9 h-9 text-blue-200" />
              <p className="text-white text-xl">Multi-branch support</p>
            </div>
          </div>
        </div>
        <div>
          <p className="text-blue-200 text-sm">
            © 2025 Optimum. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 lg:p-8">
        <div className="w-full max-w-2xl">
          <Card className="border-gray-200 bg-white">
            <CardContent className="pt-6">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Sign In to Your Account
                </h2>
                <p className="text-gray-600">
                  Access your dashboard and account settings
                </p>
              </div>

              {/* Location Banner */}
              {renderLocationBanner()}

              <LoginForm />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}