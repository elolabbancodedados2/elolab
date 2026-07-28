
-- Vincula profile da médica à clínica
UPDATE public.profiles
SET clinica_id = '97a6678a-e66e-431d-95b1-9c00517d4e0c',
    updated_at = now()
WHERE id = '608f488b-1601-46af-9ade-6ef41eb72ed2';

-- Concede role médico
INSERT INTO public.user_roles (user_id, role)
VALUES ('608f488b-1601-46af-9ade-6ef41eb72ed2', 'medico')
ON CONFLICT (user_id, role) DO NOTHING;

-- Liga o registro em medicos ao user_id da médica
UPDATE public.medicos
SET user_id = '608f488b-1601-46af-9ade-6ef41eb72ed2',
    ativo = true,
    updated_at = now()
WHERE id = 'c4e84965-cd1c-408f-b090-098323fcc73d';
