import { MapIcon, ChartBarIcon, ChartPieIcon, PresentationChartLineIcon } from '@heroicons/react/24/outline';
import type { ChartType } from '../../utils/chartSpecGenerator';

interface ChartTypeSelectorProps {
    onSelectType: (type: ChartType) => void;
}

export function ChartTypeSelector({ onSelectType }: ChartTypeSelectorProps) {
    return (
        <div className="text-center">
            <h3 className="text-lg font-normal text-gray-600 mb-8">Choose a visual to start</h3>
            <div className="flex items-center justify-center gap-6">
                {/* Bar Chart Icon */}
                <button
                    onClick={() => onSelectType('bar')}
                    className="p-4 hover:bg-gray-200 rounded-lg transition-colors group cursor-pointer"
                    title="Bar Chart"
                    type="button"
                >
                    <ChartBarIcon className="w-10 h-10 text-gray-600 group-hover:text-gray-800" />
                </button>

                {/* Horizontal Bar Chart Icon */}
                <button
                    onClick={() => onSelectType('horizontal-bar')}
                    className="p-4 hover:bg-gray-200 rounded-lg transition-colors group cursor-pointer"
                    title="Horizontal Bar Chart"
                    type="button"
                >
                    <ChartBarIcon className="w-10 h-10 text-gray-600 group-hover:text-gray-800 rotate-90" />
                </button>

                {/* Line Chart Icon */}
                <button
                    onClick={() => onSelectType('line')}
                    className="p-4 hover:bg-gray-200 rounded-lg transition-colors group cursor-pointer"
                    title="Line Chart"
                    type="button"
                >
                    <PresentationChartLineIcon className="w-10 h-10 text-gray-600 group-hover:text-gray-800" />
                </button>

                {/* Pie Chart Icon */}
                <button
                    onClick={() => onSelectType('pie')}
                    className="p-4 hover:bg-gray-200 rounded-lg transition-colors group cursor-pointer"
                    title="Pie Chart"
                    type="button"
                >
                    <ChartPieIcon className="w-10 h-10 text-gray-600 group-hover:text-gray-800" />
                </button>

                {/* Map Icon */}
                <button
                    onClick={() => onSelectType('map')}
                    className="p-4 hover:bg-gray-200 rounded-lg transition-colors group cursor-pointer"
                    title="Map View"
                    type="button"
                >
                    <MapIcon className="w-10 h-10 text-gray-600 group-hover:text-gray-800" />
                </button>
            </div>
        </div>
    );
}
