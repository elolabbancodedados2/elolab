import { memo } from 'react';
import { motion } from 'framer-motion';
import { Users, Building2, Baby, Heart } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface PatientStatsProps {
  total: number | string;
  comConvenio: number | string;
  menores: number | string;
  comAlergias: number | string;
}

export const PatientStats = memo(function PatientStats({ total, comConvenio, menores, comAlergias }: PatientStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-xl font-bold tabular-nums">{total}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10"><Building2 className="h-5 w-5 text-blue-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Com Convênio</p>
              <p className="text-xl font-bold tabular-nums">{comConvenio}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10"><Baby className="h-5 w-5 text-amber-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Menores</p>
              <p className="text-xl font-bold tabular-nums">{menores}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10"><Heart className="h-5 w-5 text-destructive" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Com Alergias</p>
              <p className="text-xl font-bold tabular-nums">{comAlergias}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});
