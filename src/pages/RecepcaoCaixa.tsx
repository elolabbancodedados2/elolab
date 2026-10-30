import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { getReceptionCashTab } from '@/lib/cashierAccess';
import Recepcao from './Recepcao';

export default function RecepcaoCaixa() {
  const { profile } = useSupabaseAuth();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const roles = [...new Set([...(profile?.roles ?? []), ...(profile?.role ? [profile.role] : [])])];

  if (getReceptionCashTab(searchParams.get('tab'), roles) === 'caixa') {
    return <Navigate to="/caixa-diario" replace state={location.state} />;
  }

  return <Recepcao onOpenCaixa={() => navigate('/caixa-diario')} />;
}
