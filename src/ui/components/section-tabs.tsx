import {Tabs} from '@heroui/react';
import {useLayoutEffect, useRef} from 'react';
import type {WorkspaceSection} from '../shell-types.js';

export function SectionTabs({
  sections,
  selected,
  onSelect,
}: {
  sections: WorkspaceSection[];
  selected: string;
  onSelect(value: string): void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    root.current
      ?.querySelector('[role="tab"][aria-selected="true"]')
      ?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        container: 'nearest',
      } as ScrollIntoViewOptions);
  }, [selected]);
  return (
    <Tabs
      ref={root}
      className="workspace-sections"
      selectedKey={selected}
      onSelectionChange={key => onSelect(String(key))}
    >
      <Tabs.ListContainer>
        <Tabs.List aria-label="Разделы экрана">
          {sections.map(section => (
            <Tabs.Tab
              key={section.value}
              id={section.value}
              data-ui-value={section.value}
            >
              {section.label}
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
      {sections.map(section => (
        <Tabs.Panel key={section.value} id={section.value} shouldForceMount>
          <section
            data-section={section.value}
            className="workspace-section"
            dangerouslySetInnerHTML={{__html: section.content}}
          />
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}
