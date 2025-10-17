import { ChartTypeIconGrid, ChartTypeOption } from './ChartTypeIconGrid';

interface ChartTypeSelectorProps {
    onSelectType: (type: ChartTypeOption) => void;
}

export function ChartTypeSelector({ onSelectType }: ChartTypeSelectorProps) {
    return (
        <div className="text-center">
            <h3 className="text-lg font-normal text-gray-600 mb-8">グラフの種類を選択してください</h3>
            <ChartTypeIconGrid selectedType="" onSelect={onSelectType} iconSize="large" variant="selector" />
        </div>
    );
}
