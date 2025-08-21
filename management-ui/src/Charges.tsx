import { useEffect, useState, useMemo } from "react";
import { Table, Card, Spin, message } from "antd";
import { getAllChargeTransactions, ChargeTransaction, MonthlyData, YearlySummary } from "./services/chargeTransactionService";

const Charges: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [transactions, setTransactions] = useState<ChargeTransaction[]>([]);
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    fetchChargeTransactions();
  }, []);

  const fetchChargeTransactions = async () => {
    setLoading(true);
    try {
      const data = await getAllChargeTransactions();
      setTransactions(data);
    } catch (error) {
      console.error("Failed to load charge transactions:", error);
      message.error("Failed to load charge transactions.");
    }
    setLoading(false);
  };

  // Process raw transactions into monthly and yearly summaries
  const reportData = useMemo(() => {
    if (!transactions.length) {
      return { monthly_data: [], yearly_summaries: [] };
    }

    // Filter out failed transactions (those with 0 or null final_energy_kwh)
    const validTransactions = transactions.filter(transaction => 
      transaction.final_energy_kwh > 0
    );

    if (!validTransactions.length) {
      return { monthly_data: [], yearly_summaries: [] };
    }

    // Group by month and resident
    const monthlyGroups = new Map<string, { transactions: ChargeTransaction[], total_energy: number, total_cost: number }>();
    const yearlyGroups = new Map<string, { transactions: ChargeTransaction[], total_energy: number, total_cost: number }>();

    validTransactions.forEach(transaction => {
      const date = new Date(transaction.created);
      const year = date.getFullYear();
      const month = date.getMonth() + 1; // getMonth() returns 0-11
      const monthKey = `${year}-${month.toString().padStart(2, '0')}-${transaction.resident_name}`;
      const yearKey = `${year}-${transaction.resident_name}`;
      
      // Calculate transaction cost
      const transactionCost = transaction.power_logs?.reduce((sum, log) => {
        return sum + (log.delta_power_cost || 0);
      }, 0) || 0;

      // Monthly grouping
      if (!monthlyGroups.has(monthKey)) {
        monthlyGroups.set(monthKey, { transactions: [], total_energy: 0, total_cost: 0 });
      }
      const monthlyGroup = monthlyGroups.get(monthKey)!;
      monthlyGroup.transactions.push(transaction);
      monthlyGroup.total_energy += transaction.final_energy_kwh;
      monthlyGroup.total_cost += transactionCost;

      // Yearly grouping by resident
      if (!yearlyGroups.has(yearKey)) {
        yearlyGroups.set(yearKey, { transactions: [], total_energy: 0, total_cost: 0 });
      }
      const yearlyGroup = yearlyGroups.get(yearKey)!;
      yearlyGroup.transactions.push(transaction);
      yearlyGroup.total_energy += transaction.final_energy_kwh;
      yearlyGroup.total_cost += transactionCost;
    });

    // Convert to arrays and format
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    const monthly_data: MonthlyData[] = Array.from(monthlyGroups.entries())
      .map(([key, group]) => {
        const [yearStr, monthStr, resident_name] = key.split('-', 3);
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);
        const monthName = monthNames[month - 1];
        
        return {
          year,
          month,
          month_display: `${monthName} '${year.toString().slice(2)}`,
          resident_name,
          total_energy: group.total_energy,
          transaction_count: group.transactions.length,
          total_cost: group.total_cost
        };
      })
      .sort((a, b) => {
        // Sort by year desc, then month desc, then by resident name
        if (a.year !== b.year) return b.year - a.year;
        if (a.month !== b.month) return b.month - a.month;
        return a.resident_name.localeCompare(b.resident_name);
      });

    const yearly_summaries: YearlySummary[] = Array.from(yearlyGroups.entries())
      .map(([key, group]) => {
        const [yearStr, resident_name] = key.split('-', 2);
        const year = parseInt(yearStr);
        
        return {
          year,
          resident_name,
          total_energy: group.total_energy,
          transaction_count: group.transactions.length,
          total_cost: group.total_cost
        };
      })
      .sort((a, b) => {
        // Sort by year desc, then by resident name
        if (a.year !== b.year) return b.year - a.year;
        return a.resident_name.localeCompare(b.resident_name);
      });

    return { monthly_data, yearly_summaries };
  }, [transactions]);

  const monthlyColumns = [
    {
      title: "Month",
      dataIndex: "month_display",
      key: "month_display",
      sorter: (a: MonthlyData, b: MonthlyData) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      },
      defaultSortOrder: 'descend' as const,
    },
    {
      title: "Resident",
      dataIndex: "resident_name",
      key: "resident_name",
      sorter: (a: MonthlyData, b: MonthlyData) => a.resident_name.localeCompare(b.resident_name),
    },
    {
      title: "Energy (kWh)",
      dataIndex: "total_energy",
      key: "total_energy",
      render: (value: number) => value.toFixed(2),
      sorter: (a: MonthlyData, b: MonthlyData) => a.total_energy - b.total_energy,
    },
    {
      title: "Transactions",
      dataIndex: "transaction_count",
      key: "transaction_count",
      sorter: (a: MonthlyData, b: MonthlyData) => a.transaction_count - b.transaction_count,
    },
    {
      title: "Cost (€)",
      dataIndex: "total_cost",
      key: "total_cost",
      render: (value: number) => `€${value.toFixed(2)}`,
      sorter: (a: MonthlyData, b: MonthlyData) => a.total_cost - b.total_cost,
    },
  ];

  const yearlyColumns = [
    {
      title: "Year",
      dataIndex: "year",
      key: "year",
      sorter: (a: YearlySummary, b: YearlySummary) => b.year - a.year,
      defaultSortOrder: 'descend' as const,
    },
    {
      title: "Resident",
      dataIndex: "resident_name",
      key: "resident_name",
      sorter: (a: YearlySummary, b: YearlySummary) => a.resident_name.localeCompare(b.resident_name),
    },
    {
      title: "Energy (kWh)",
      dataIndex: "total_energy",
      key: "total_energy",
      render: (value: number) => value.toFixed(2),
      sorter: (a: YearlySummary, b: YearlySummary) => a.total_energy - b.total_energy,
    },
    {
      title: "Transactions",
      dataIndex: "transaction_count",
      key: "transaction_count",
      sorter: (a: YearlySummary, b: YearlySummary) => a.transaction_count - b.transaction_count,
    },
    {
      title: "Cost (€)",
      dataIndex: "total_cost",
      key: "total_cost",
      render: (value: number) => `€${value.toFixed(2)}`,
      sorter: (a: YearlySummary, b: YearlySummary) => a.total_cost - b.total_cost,
    },
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: isMobile ? '20px' : '50px' }}>
        <Spin size="large" />
        <p>Loading charge transactions...</p>
      </div>
    );
  }

  if (!transactions.length) {
    return (
      <div style={{ textAlign: 'center', padding: isMobile ? '20px' : '50px' }}>
        <p>No charge transactions available.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Yearly Summaries */}
      <Card title="Yearly Summaries" style={{ marginBottom: 24 }}>
        <Table
          columns={yearlyColumns}
          dataSource={reportData.yearly_summaries}
          rowKey={(record) => `${record.year}-${record.resident_name}`}
          pagination={false}
          size={isMobile ? "small" : "middle"}
          scroll={{ x: isMobile ? 600 : undefined }}
        />
      </Card>

      {/* Monthly Data */}
      <Card title="Monthly Charge Data">
        <Table
          columns={monthlyColumns}
          dataSource={reportData.monthly_data}
          rowKey={(record) => `${record.year}-${record.month}-${record.resident_name}`}
          pagination={{
            pageSize: isMobile ? 10 : 20,
            showSizeChanger: !isMobile,
            showQuickJumper: !isMobile,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
            size: isMobile ? "small" : "default",
          }}
          size={isMobile ? "small" : "middle"}
          scroll={{ x: isMobile ? 600 : undefined }}
        />
      </Card>
    </div>
  );
};

export default Charges; 