// components/locationCheck/location.tsx 
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkLocation } from '@/lib/geofence';
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from 'lucide-react';

export default function LocationCheck({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { toast } = useToast();
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [isDevEnvironment] = useState(process.env.NODE_ENV === 'development');

useEffect(() => {
    let initialCheckDone = false;

    const checkLocationOnce = async () => {
      try {
        if (!navigator.geolocation) {
          console.warn('Geolocation is not supported by this browser');
          if (!isDevEnvironment) {
            setShowLocationPrompt(true);
          }
          return;
        }

        if (navigator.permissions) {
          const permissionStatus = await navigator.permissions.query({ name: 'geolocation' });

          if (permissionStatus.state === 'prompt' && !initialCheckDone) {
            setShowLocationPrompt(true);
            return;
          } else if (permissionStatus.state === 'denied') {
            console.warn('Geolocation permission denied');
            if (!isDevEnvironment) {
              toast({
                title: "Location Access Required",
                description: "Please enable location access in your browser settings.",
                variant: "destructive"
              });
              setCheckFailed(true);
              return;
            }
          }
        }

        // Location check result is noted but no action is taken
        await checkLocation();

        initialCheckDone = true;
        setCheckFailed(false);
      } catch (error) {
        console.error('Location check failed:', error);
        setCheckFailed(true);

        if (!isDevEnvironment) {
          toast({
            title: "Location Check Failed",
            description: "Please ensure location access is enabled.",
            variant: "destructive"
          });
        }
      }
    };

    const initialCheckTimeout = setTimeout(() => {
      checkLocationOnce();
    }, 1000);

    return () => {
      clearTimeout(initialCheckTimeout);
    };
  }, [router, toast, isDevEnvironment]);

  const handleAllowLocation = async () => {
    setShowLocationPrompt(false);
    try {
      await checkLocation();
    } catch (error) {
      console.error('Location check failed after permission:', error);
    }
  };

  const handleRetryLocationCheck = async () => {
    try {
      await checkLocation();
      setCheckFailed(false);
    } catch (error) {
      toast({
        title: "Location Check Failed",
        description: "Please check your browser settings and try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <>
      {checkFailed && !isDevEnvironment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full">
            <div className="flex items-center gap-2 text-red-500 mb-4">
              <AlertTriangle className="h-6 w-6" />
              <h2 className="text-xl font-bold">Location Error</h2>
            </div>
            <p className="mb-4">We couldn't verify your location. This app requires location access to function properly.</p>
            <div className="flex flex-col gap-2">
              <Button onClick={handleRetryLocationCheck} className="w-full">
                Retry Location Check
              </Button>
              <Button variant="outline" onClick={() => router.push('/login')} className="w-full">
                Return to Login
              </Button>
            </div>
          </div>
        </div>
      )}

      {(!checkFailed || isDevEnvironment) && children}
    </>
  );
}