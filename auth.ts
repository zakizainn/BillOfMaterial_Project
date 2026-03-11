// auth.ts - helper untuk get session di server side (v4 compatible)
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

export const getSession = () => getServerSession(authOptions);
