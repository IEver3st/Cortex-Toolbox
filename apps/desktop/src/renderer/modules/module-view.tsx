import type { ModuleId } from '../../shared/modules';
import { MODULE_COMPONENTS } from './registry';

export function ModuleView({ id }: { id: ModuleId }): React.JSX.Element {
  const Component = MODULE_COMPONENTS[id];
  return <Component />;
}
