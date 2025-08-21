import { useEffect, useMemo, useState } from 'react';
import { apiFetch, apiFetchBlob } from '../api';

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function ExportButtons() {
  const download = async (path, filename) => {
    const blob = await apiFetchBlob(path);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="flex gap-2">
      <button onClick={() => download('/analytics/export/csv', 'parcels.csv')} className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50">Export CSV</button>
      <button onClick={() => download('/analytics/export/pdf', 'parcels.pdf')} className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50">Export PDF</button>
    </div>
  );
}

function AssignmentCell({ parcel, agents, onAssigned }) {
  const [agentId, setAgentId] = useState(parcel.agent?._id || parcel.agent || '');

  const isAssigned = Boolean(parcel.agent);
  const save = async () => {
    if (!agentId) return;
    const updated = await apiFetch(`/parcels/${parcel._id}/assign`, { method: 'POST', body: JSON.stringify({ agentId }) });
    onAssigned(updated);
  };
  return (
    <div className="flex items-center gap-2">
      <select className="rounded-md border px-2 py-1 text-sm" value={agentId} onChange={e => setAgentId(e.target.value)}>
        <option value="">Select agent</option>

        {agents.map(a => (
          <option key={a._id} value={a._id}>{a.name}</option>
        ))}
      </select>
      <button onClick={save} className="rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700">{isAssigned ? 'Reassign' : 'Assign'}</button>
    </div>
  );
}

export default function AdminPanel() {
  const [metrics, setMetrics] = useState(null);
  const [users, setUsers] = useState([]);
  const [parcels, setParcels] = useState([]);
  const [agents, setAgents] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiFetch('/analytics/dashboard').then(setMetrics).catch(() => { });
    apiFetch('/users').then(setUsers).catch(() => { });
    apiFetch('/parcels').then(setParcels).catch(() => { });
    apiFetch('/assignments/agents').then(setAgents).catch(() => { });
  }, []);

  const filteredParcels = useMemo(() => {
    if (!search) return parcels;
    const q = search.toLowerCase();
    return parcels.filter(p => (p.trackingCode || '').toLowerCase().includes(q) || (p.status || '').toLowerCase().includes(q));
  }, [parcels, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Admin Dashboard</h2>
        <ExportButtons />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Daily bookings" value={metrics?.dailyBookings ?? '—'} />
        <Stat label="Failed deliveries" value={metrics?.failedDeliveries ?? '—'} />
        <Stat label="COD collected" value={metrics?.codAmount != null ? `$${metrics.codAmount}` : '—'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border bg-white p-6 shadow-sm lg:col-span-1">
          <h3 className="mb-4 text-lg font-semibold">Users</h3>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-gray-500">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u._id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{u.name}</td>
                    <td className="py-2 pr-4">{u.email}</td>
                    <td className="py-2 pr-4"><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{u.role}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">Bookings</h3>
            <input placeholder="Search by tracking or status" className="w-64 rounded-md border px-3 py-2 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-gray-500">
                  <th className="py-2 pr-4">Tracking</th>
                  <th className="py-2 pr-4">Customer</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Payment</th>
                  <th className="py-2 pr-4">Agent</th>
                  <th className="py-2 pr-4">Assign</th>
                </tr>
              </thead>
              <tbody>
                {filteredParcels.map(p => (
                  <tr key={p._id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{p.trackingCode}</td>
                    <td className="py-2 pr-4">{p.customer?.name || '-'}</td>
                    <td className="py-2 pr-4"><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{p.status}</span></td>
                    <td className="py-2 pr-4">{p.paymentType}{p.paymentType === 'COD' ? ` ($${p.codAmount})` : ''}</td>
                    <td className="py-2 pr-4">{agents.find(a => a._id === (p.agent?._id || p.agent))?.name || '-'}</td>
                    <td className="py-2 pr-4">
                      <AssignmentCell parcel={p} agents={agents} onAssigned={(updated) => {
                        setParcels(list => list.map(x => x._id === updated._id ? updated : x));
                      }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
