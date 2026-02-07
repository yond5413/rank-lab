'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Bell, BellOff, AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import { formatAdminDate } from '@/lib/adminDateFormat';

interface SystemAlert {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  timestamp: string;
  acknowledged: boolean;
  source: string;
}

interface AlertSystemProps {
  onAlertsChange?: (alerts: SystemAlert[]) => void;
}

export function AlertSystem({ onAlertsChange }: AlertSystemProps) {
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [hasMounted, setHasMounted] = useState(false);

  // Poll backend for computed alerts
  const checkForAlerts = async () => {
    try {
      const newAlerts = await adminFetch<SystemAlert[]>('/alerts');

      setAlerts(newAlerts);
      setLastCheck(new Date());
      
      if (onAlertsChange) {
        onAlertsChange(newAlerts);
      }
    } catch (error) {
      console.error('Failed to check for alerts:', error);
    }
  };

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (alertsEnabled) {
      checkForAlerts();
      
      // Check for alerts every 30 seconds
      const interval = setInterval(checkForAlerts, 30000);
      return () => clearInterval(interval);
    }
  }, [alertsEnabled]);

  const acknowledgeAlert = (alertId: string) => {
    setAlerts(prev => prev.map(alert => 
      alert.id === alertId ? { ...alert, acknowledged: true } : alert
    ));
  };

  const dismissAlert = (alertId: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== alertId));
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'success':
        return CheckCircle;
      case 'warning':
        return AlertTriangle;
      case 'error':
        return XCircle;
      default:
        return Bell;
    }
  };

  const getAlertVariant = (type: string) => {
    switch (type) {
      case 'success':
        return 'default' as const;
      case 'warning':
        return 'secondary' as const;
      case 'error':
        return 'destructive' as const;
      default:
        return 'outline' as const;
    }
  };

  const unacknowledgedCount = alerts.filter(alert => !alert.acknowledged).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              System Alerts
              {unacknowledgedCount > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {unacknowledgedCount}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Real-time system notifications and alerts
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={alertsEnabled ? "default" : "outline"}
              size="sm"
              onClick={() => setAlertsEnabled(!alertsEnabled)}
            >
              {alertsEnabled ? (
                <>
                  <Bell className="w-4 h-4 mr-2" />
                  Enabled
                </>
              ) : (
                <>
                  <BellOff className="w-4 h-4 mr-2" />
                  Disabled
                </>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={checkForAlerts}>
              Check Now
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="w-8 h-8 mx-auto mb-2" />
            <p>No active alerts</p>
            <p className="text-sm">System is running smoothly</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {alerts.map((alert) => {
              const Icon = getAlertIcon(alert.type);
              return (
                <div key={alert.id} className={`p-4 border rounded-lg ${alert.acknowledged ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <Icon className={`w-5 h-5 mt-0.5 ${
                        alert.type === 'success' ? 'text-green-600' :
                        alert.type === 'warning' ? 'text-yellow-600' :
                        alert.type === 'error' ? 'text-red-600' :
                        'text-blue-600'
                      }`} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold">{alert.title}</h4>
                          <Badge variant={getAlertVariant(alert.type)}>
                            {alert.type}
                          </Badge>
                          {alert.acknowledged && (
                            <Badge variant="outline" className="text-xs">
                              Acknowledged
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {alert.message}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatAdminDate(alert.timestamp)}
                          </span>
                          <span>Source: {alert.source}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!alert.acknowledged && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => acknowledgeAlert(alert.id)}
                        >
                          Acknowledge
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => dismissAlert(alert.id)}
                      >
                        ×
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        
        <div className="mt-4 pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            Last checked: {hasMounted && lastCheck ? formatAdminDate(lastCheck) : '--'}
            {alertsEnabled && <span className="ml-2">• Auto-refresh every 30s</span>}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}