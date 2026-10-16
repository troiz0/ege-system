import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Tabs } from '../components/ui/Tabs';
import { LoadingPage } from '../components/ui/LoadingSpinner';
import { useToastStore } from '../store/toastStore';
import { api } from '../lib/api';
import { Settings as SettingsIcon, Save } from 'lucide-react';
import type { MeshPrepSettings } from '../lib/types';

const DEFAULT_SETTINGS: MeshPrepSettings = {
  meshIntegrationEnabled: false,
  meshAiContextEnabled: false,
  meshWeakTopicsEnabled: false,
  meshPredictorInfluenceEnabled: false,
  meshScheduleThrottlingEnabled: false,
  notificationsEnabled: true,
};

export function SettingsPage() {
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'mesh_prep';
  const { addToast } = useToastStore();
  const [settings, setSettings] = useState<MeshPrepSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await api.getSettings();
      const master = data.meshEnabled ?? data.meshIntegrationEnabled ?? false;
      setSettings({
        ...data,
        meshIntegrationEnabled: master,
        meshAiContextEnabled: master ? Boolean(data.meshChatContext ?? data.meshAiContextEnabled) : false,
        meshWeakTopicsEnabled: master ? Boolean(data.meshWeakTopics ?? data.meshWeakTopicsEnabled) : false,
        meshPredictorInfluenceEnabled: master ? Boolean(data.meshScorePredictor ?? data.meshPredictorInfluenceEnabled) : false,
        meshScheduleThrottlingEnabled: master ? Boolean(data.meshScheduleAdaptation ?? data.meshScheduleThrottlingEnabled) : false,
      });
    } catch {
      const saved = localStorage.getItem('app_settings');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setSettings((prev) => ({ ...prev, ...parsed }));
        } catch {}
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: MeshPrepSettings = {
        ...settings,
        meshEnabled: settings.meshIntegrationEnabled,
        meshChatContext: settings.meshAiContextEnabled,
        meshWeakTopics: settings.meshWeakTopicsEnabled,
        meshScorePredictor: settings.meshPredictorInfluenceEnabled,
        meshScheduleAdaptation: settings.meshScheduleThrottlingEnabled,
      };
      const updated = await api.updateSettings(payload);
      setSettings(updated);
      localStorage.setItem('app_settings', JSON.stringify(updated));
      addToast('success', 'Настройки сохранены');
    } catch {
      localStorage.setItem('app_settings', JSON.stringify(settings));
      addToast('info', 'Настройки сохранены');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleMaster = (checked: boolean) => {
    setSettings((prev) => ({
      ...prev,
      meshIntegrationEnabled: checked,
      ...(checked
        ? {
            meshAiContextEnabled: prev.meshAiContextEnabled,
            meshWeakTopicsEnabled: prev.meshWeakTopicsEnabled,
            meshPredictorInfluenceEnabled: prev.meshPredictorInfluenceEnabled,
            meshScheduleThrottlingEnabled: prev.meshScheduleThrottlingEnabled,
          }
        : {}),
    }));
  };

  const handleEnableAllMesh = () => {
    setSettings((prev) => ({
      ...prev,
      meshIntegrationEnabled: true,
      meshAiContextEnabled: true,
      meshWeakTopicsEnabled: true,
      meshPredictorInfluenceEnabled: true,
      meshScheduleThrottlingEnabled: true,
    }));
    addToast('info', 'Все функции подготовки по данным МЭШ включены');
  };

  const handleStrictKimMode = () => {
    setSettings((prev) => ({
      ...prev,
      meshIntegrationEnabled: false,
      meshAiContextEnabled: false,
      meshWeakTopicsEnabled: false,
      meshPredictorInfluenceEnabled: false,
      meshScheduleThrottlingEnabled: false,
    }));
    addToast('info', 'Активирован строгий режим КИМ: данные МЭШ изолированы');
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.setItem('app_settings', JSON.stringify(DEFAULT_SETTINGS));
    addToast('success', 'Настройки сброшены');
  };

  const tabs = [
    {
      id: 'mesh_prep',
      label: 'Подготовка по МЭШ',
      content: (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
              <CardTitle>Режим подготовки на основе МЭШ</CardTitle>
              <span className="px-2 py-0.5 border border-amber-500/40 bg-amber-500/10 text-amber-400 font-mono text-[10px] uppercase font-bold tracking-wider rounded-none">
                НЕ РЕКОМЕНДУЕТСЯ
              </span>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex cursor-pointer items-center justify-between rounded-none border border-white/[0.08] bg-white/[0.02] p-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-zinc-200">
                      Включить влияние данных МЭШ на подготовку
                    </span>
                    <span className="px-1.5 py-0.5 border border-amber-500/40 bg-amber-500/10 text-amber-400 font-mono text-[9px] uppercase font-bold tracking-wider rounded-none">
                      НЕ РЕКОМЕНДУЕТСЯ
                    </span>
                  </div>
                  <div className="text-sm font-light text-zinc-500 mt-1">
                    Учитывать школьные оценки, расписание и домашние задания при подготовке к ЕГЭ
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.meshIntegrationEnabled}
                  onChange={(e) => handleToggleMaster(e.target.checked)}
                  className="h-5 w-5 accent-[#d4ff00] rounded-none cursor-pointer shrink-0 ml-3"
                />
              </label>

              <div className="flex items-center justify-between rounded-none border border-white/[0.08] bg-white/[0.02] p-3">
                <span className="text-sm text-zinc-300">Текущий режим работы</span>
                <span
                  className={`font-mono text-xs tracking-[0.15em] ${
                    settings.meshIntegrationEnabled ? 'text-[#d4ff00]' : 'text-zinc-500'
                  }`}
                >
                  {settings.meshIntegrationEnabled ? 'СИНХРОНИЗАЦИЯ С МЭШ' : 'СТРОГИЙ КИМ ФИПИ'}
                </span>
              </div>

              <p className="text-xs text-zinc-500 leading-relaxed">
                <span className="text-amber-400 font-semibold">[НЕ РЕКОМЕНДУЕТСЯ]</span> Включение синхронизации со школьным дневником подмешивает текущие школьные оценки за конспекты и опросы в ядро КИМ ФИПИ-2027. Для максимального результата на экзамене рекомендуется использовать независимый режим тренажера.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Модули интеграции с электронным дневником</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <label
                className={`flex cursor-pointer items-center justify-between rounded-none border border-white/[0.08] bg-white/[0.02] p-4 ${
                  !settings.meshIntegrationEnabled ? 'opacity-40 cursor-not-allowed' : ''
                }`}
              >
                <div>
                  <div className="font-medium text-zinc-200">
                    ИИ-репетитор: автоматический контекст МЭШ
                  </div>
                  <div className="text-sm font-light text-zinc-500">
                    Передавать средний балл школы, темы уроков и ДЗ в контекст диалога с ИИ
                  </div>
                </div>
                <input
                  type="checkbox"
                  disabled={!settings.meshIntegrationEnabled}
                  checked={settings.meshAiContextEnabled}
                  onChange={(e) =>
                    setSettings({ ...settings, meshAiContextEnabled: e.target.checked })
                  }
                  className="h-5 w-5 accent-[#d4ff00] rounded-none cursor-pointer"
                />
              </label>

              <label
                className={`flex cursor-pointer items-center justify-between rounded-none border border-white/[0.08] bg-white/[0.02] p-4 ${
                  !settings.meshIntegrationEnabled ? 'opacity-40 cursor-not-allowed' : ''
                }`}
              >
                <div>
                  <div className="font-medium text-zinc-200">
                    Слабые темы: учет школьных оценок
                  </div>
                  <div className="text-sm font-light text-zinc-500">
                    Формировать пробелы на основе троек и двоек за текущие работы и уроки в МЭШ
                  </div>
                </div>
                <input
                  type="checkbox"
                  disabled={!settings.meshIntegrationEnabled}
                  checked={settings.meshWeakTopicsEnabled}
                  onChange={(e) =>
                    setSettings({ ...settings, meshWeakTopicsEnabled: e.target.checked })
                  }
                  className="h-5 w-5 accent-[#d4ff00] rounded-none cursor-pointer"
                />
              </label>

              <label
                className={`flex cursor-pointer items-center justify-between rounded-none border border-white/[0.08] bg-white/[0.02] p-4 ${
                  !settings.meshIntegrationEnabled ? 'opacity-40 cursor-not-allowed' : ''
                }`}
              >
                <div>
                  <div className="font-medium text-zinc-200">
                    Предиктор балла: влияние успеваемости школы
                  </div>
                  <div className="text-sm font-light text-zinc-500">
                    Учитывать средневзвешенный процент МЭШ (вес 30%) в расчете прогнозируемого балла ЕГЭ
                  </div>
                </div>
                <input
                  type="checkbox"
                  disabled={!settings.meshIntegrationEnabled}
                  checked={settings.meshPredictorInfluenceEnabled}
                  onChange={(e) =>
                    setSettings({ ...settings, meshPredictorInfluenceEnabled: e.target.checked })
                  }
                  className="h-5 w-5 accent-[#d4ff00] rounded-none cursor-pointer"
                />
              </label>

              <label
                className={`flex cursor-pointer items-center justify-between rounded-none border border-white/[0.08] bg-white/[0.02] p-4 ${
                  !settings.meshIntegrationEnabled ? 'opacity-40 cursor-not-allowed' : ''
                }`}
              >
                <div>
                  <div className="font-medium text-zinc-200">
                    Учебный план: адаптация к сетке уроков
                  </div>
                  <div className="text-sm font-light text-zinc-500">
                    Сокращать нагрузку подготовки к ЕГЭ в дни с 6–8 школьными уроками по расписанию МЭШ
                  </div>
                </div>
                <input
                  type="checkbox"
                  disabled={!settings.meshIntegrationEnabled}
                  checked={settings.meshScheduleThrottlingEnabled}
                  onChange={(e) =>
                    setSettings({ ...settings, meshScheduleThrottlingEnabled: e.target.checked })
                  }
                  className="h-5 w-5 accent-[#d4ff00] rounded-none cursor-pointer"
                />
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Быстрые предустановки</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  onClick={handleEnableAllMesh}
                  variant="outline"
                  className="text-xs"
                >
                  Включить все модули МЭШ
                </Button>
                <Button
                  type="button"
                  onClick={handleStrictKimMode}
                  variant="outline"
                  className="text-xs"
                >
                  Строгий КИМ (изолировать МЭШ)
                </Button>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">
                «Строгий КИМ» полностью отключает влияние электронного дневника на алгоритмы подготовки к ЕГЭ.
              </p>
            </CardContent>
          </Card>
        </div>
      ),
    },
    {
      id: 'grades',
      label: 'Оценки',
      content: (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Шкала оценивания</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-none border border-white/[0.08] bg-white/[0.02] p-3">
                <span className="text-sm text-zinc-300">Используемая шкала</span>
                <span className="font-mono text-xs tracking-[0.15em] text-[#d4ff00]">5-БАЛЛЬНАЯ</span>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Шкала закреплена за приложением и не настраивается: все тесты,
                контрольные и средние баллы считаются по 5-балльной шкале.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Пороги оценок (по среднему баллу)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-none border border-white/[0.08] bg-white/[0.02] p-3">
                  <span className="text-sm text-zinc-300">Отлично (5)</span>
                  <span className="font-mono text-xs text-green-400">&gt; 4.51</span>
                </div>
                <div className="flex items-center justify-between rounded-none border border-white/[0.08] bg-white/[0.02] p-3">
                  <span className="text-sm text-zinc-300">Хорошо (4)</span>
                  <span className="font-mono text-xs text-amber-400">3.51–4.5</span>
                </div>
                <div className="flex items-center justify-between rounded-none border border-white/[0.08] bg-white/[0.02] p-3">
                  <span className="text-sm text-zinc-300">Удовлетворительно (3)</span>
                  <span className="font-mono text-xs text-orange-400">2.51–3.5</span>
                </div>
                <div className="flex items-center justify-between rounded-none border border-white/[0.08] bg-white/[0.02] p-3">
                  <span className="text-sm text-zinc-300">Неудовлетворительно (2)</span>
                  <span className="font-mono text-xs text-red-400">&lt; 2.5</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ),
    },
    {
      id: 'notifications',
      label: 'Уведомления',
      content: (
        <Card>
          <CardHeader>
            <CardTitle>Настройки уведомлений</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex cursor-pointer items-center justify-between rounded-none border border-white/[0.08] bg-white/[0.02] p-4">
              <div>
                <div className="font-medium text-zinc-200">Включить уведомления</div>
                <div className="text-sm font-light text-zinc-500">
                  Получать уведомления о дедлайнах и событиях
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.notificationsEnabled}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    notificationsEnabled: e.target.checked,
                  })
                }
                className="h-5 w-5 accent-[#d4ff00] rounded-none cursor-pointer"
              />
            </label>
          </CardContent>
        </Card>
      ),
    },
  ];

  if (loading) return <LoadingPage />;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="mb-8">
        <p className="hud-tag mb-3">[ SYSTEM // CONFIG ]</p>
        <div className="flex items-center gap-3">
          <SettingsIcon className="h-8 w-8 text-[#d4ff00]" strokeWidth={1.5} />
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-white md:text-5xl">CONFIG</h1>
        </div>
      </div>

      <Tabs tabs={tabs} defaultTab={initialTab} />

      <div className="flex gap-3 mt-8">
        <Button onClick={handleSave} disabled={saving} variant="primary" className="flex-1">
          <Save className="w-4 h-4" />
          {saving ? 'Сохранение...' : 'Сохранить изменения'}
        </Button>
        <Button onClick={handleReset} variant="outline">
          Сбросить
        </Button>
      </div>
    </div>
  );
}
